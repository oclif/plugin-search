/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import search from '@inquirer/search'
import {Command, Flags, loadHelpClass, toConfiguredId, toStandardizedId, ux} from '@oclif/core'
import {bold} from 'ansis'
import clipboard from 'clipboardy'
import fuzzysort from 'fuzzysort'
import {got} from 'got'
import readline from 'node:readline'
import open from 'open'

export default class Search extends Command {
  public static description = 'Once you select a command, hit enter and it will show the help for that command.'

  public static readonly flags = {
    action: Flags.string({
      char: 'a',
      options: ['help', 'copy', 'doctor', 'source', 'npm'],
      summary: 'Action to take on the selected command',
    }),
  }

  public static readonly strict = false
  public static summary = 'Search for a command.'

  public async run(): Promise<unknown> {
    const {argv, flags} = await this.parse(Search)
    // Join the args together into a string so you can pass something like 'dep sta' to fuzzy search
    const args = argv.join(' ')

    const theme = {
      helpMode: 'never',
      prefix: ux.colorize(
        'cyan',
        `Use ${ux.colorize('bold', '↑')} and ${ux.colorize('bold', '↓')} keys or type to search for a command.\nPress ${ux.colorize('bold', 'ENTER')} to view help. Press ${ux.colorize('bold', 'ESC')} to exit.\n\n`,
      ),
      style: {
        description: (desc: string) => `\n${ux.colorize('cyan', desc)}`, // Give the description a little extra padding
      },
    }

    const commandChoices = this.config.commands
      .filter((c) => !c.hidden && !c.aliases.includes(c.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => {
        const name = toConfiguredId(c.id, this.config)
        return {
          description: c.summary,
          name,
          value: name,
        }
      })

    const pageSize = Math.floor(process.stdout.rows < 20 ? process.stdout.rows / 2 : 10)
    const commandPromise = search<string>(
      {
        message: 'Search for a command',
        pageSize,
        async source(input) {
          // TODO: There is a bug here somewhere:
          // - pass an arg
          // - hit down arrow
          // - hit any other character with clear the input
          // - hitting delete will clear input, but keep the fuzzy results
          if (input === undefined && args) input = args

          const results = fuzzysort.go(input!, commandChoices, {all: true, key: 'name'})

          return results.map((r) => ({
            description: r.obj.description,
            name: r.highlight(bold.open, bold.close),
            value: r.obj.value,
          }))
        },
        // @ts-expect-error Not sure why this is complaining about the helpMode type
        theme,
      },
      {clearPromptOnDone: true},
    )

    readline.emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)

    // If args were passed in, we "replay" the key presses to populate the search
    if (args) process.stdin.emit('data', args)

    // Allow the user to exit the search with the escape key or with ctrl+c
    process.stdin.on('keypress', (_, key) => {
      if ((key.name === 'escape' || (key.name === 'c' && key.ctrl)) && commandPromise) {
        commandPromise.cancel()
      }
    })

    const command = await commandPromise
      .catch((error) => {
        if (error.message === 'Prompt was canceled') return
        throw error
      })
      .then((result) => result)

    if (!command) return

    // eslint-disable-next-line unicorn/consistent-function-scoping
    const getPluginDetails = (command: string) => {
      const commandId = toStandardizedId(command, this.config)
      const commandConfig = this.config.findCommand(commandId)
      const pluginName = commandConfig?.pluginName

      if (!pluginName) this.error('Key `pluginName` not found in the config for this command.')

      const commandPjson = this.config.plugins.get(pluginName)?.pjson
      const homepage = commandPjson?.homepage
      // TODO: add a check for homepage
      const commandVersion = commandPjson?.version

      return {commandConfig, commandId, commandPjson, commandVersion, homepage, pluginName}
    }

    const getSourceUrl = async (homepage: string, commandId: string, commandVersion?: string) => {
      if (!homepage) return
      const commandToPath = `${commandId.replaceAll(':', '/')}.ts`
      // TODO: do we need to take into account directory level index.ts command files?
      // TODO: talk to Mike about dynamically built command paths
      const urls = [
        `/blob/${commandVersion}/src/commands/${commandToPath}`,
        `/blob/v${commandVersion}/src/commands/${commandToPath}`,
        `/blob/-/src/commands/${commandToPath}`,
        `/blob/main/src/commands/${commandToPath}`,
        `/blob/master/src/commands/${commandToPath}`,
      ]

      const responses = await Promise.all(urls.map((url) => got(`${homepage}${url}`, {throwHttpErrors: false})))
      return responses.find((r) => r.statusCode === 200)?.url ?? undefined
    }

    const {commandId, commandVersion, homepage, pluginName} = getPluginDetails(command)
    const sourceUrl = await getSourceUrl(homepage, commandId, commandVersion)

    let actionPrompt

    if (!flags.action) {
      const actions = [
        {
          description: 'Show the help text for this command',
          name: 'Show help',
          value: 'help',
        },
        {
          description: 'Copy the command to your clipboard',
          name: 'Copy command',
          value: 'copy',
        },
        {
          description: 'Copy the command to your clipboard for use with the doctor command',
          name: 'Copy command for doctor',
          value: 'doctor',
        },
        {
          description: 'Open the source code for this command on GitHub',
          disabled: sourceUrl ? false : '(Unable to resolve source code URL)',
          name: 'Go to source code',
          value: 'source',
        },
        {
          description: 'View the npm details for this package',
          name: 'View package on npm',
          value: 'npm',
        },
      ]

      const actionPromise = search<string>(
        {
          message: `Select an action for: ${ux.colorize('dim', '$ sf ' + command)}`,
          pageSize,
          async source(input) {
            const results = fuzzysort.go(input!, actions, {all: true, key: 'name'})

            return results.map((r) => ({
              description: r.obj.description,
              disabled: r.obj.disabled,
              name: r.highlight(bold.open, bold.close),
              value: r.obj.value,
            }))
          },
          // @ts-expect-error Not sure why this is complaining about the helpMode type
          theme,
        },
        {clearPromptOnDone: true},
      )

      // Allow the user to exit the search with the escape key or with ctrl+c
      process.stdin.on('keypress', (_, key) => {
        if ((key.name === 'escape' || (key.name === 'c' && key.ctrl)) && actionPromise) {
          actionPromise.cancel()
        }
      })

      actionPrompt = await actionPromise
        .catch((error) => {
          if (error.message === 'Prompt was canceled') return
          throw error
        })
        .then((result) => result)
    }

    switch (flags.action ?? actionPrompt) {
      case 'help': {
        const Help = await loadHelpClass(this.config)
        const help = new Help(this.config, this.config.pjson.oclif.helpOptions ?? this.config.pjson.helpOptions)
        return help.showHelp([toStandardizedId(command, this.config)])
      }

      case 'copy': {
        clipboard.writeSync(`sf ${command} `)
        this.log(ux.colorize('green', 'Command copied to clipboard!'))
        break
      }

      case 'doctor': {
        clipboard.writeSync(`sf doctor --command "${command}"`)
        this.log(ux.colorize('green', 'Command copied to clipboard!'))
        break
      }

      case 'npm': {
        open(`https://www.npmjs.com/package/${pluginName}/v/${commandVersion}`)
        break
      }

      case 'source': {
        open(sourceUrl!)
        break
      }
    }
  }
}

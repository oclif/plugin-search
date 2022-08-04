/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {prompt, registerPrompt} from 'inquirer'
import {Command, Interfaces, toConfiguredId, toStandardizedId} from '@oclif/core'
import {AutocompleteSearch, Choices} from '../util/autocomplete'

export default class Search extends Command {
  public static summary = 'Search for a command.'
  public static description = 'Once you select a command, hit enter and it will show the help for that command.'

  public async run(): Promise<unknown> {
    const commands = this.config.commands as Array<Interfaces.Command.Loadable & { readableId: string }>
    for (const command of commands) {
      command.readableId = toConfiguredId(command.id, this.config)
    }

    registerPrompt('autocomplete-search', AutocompleteSearch)

    const {command} = await prompt<{ command: string }>([
      {
        type: 'autocomplete-search',
        name: 'command',
        message: 'Search for a command',
        emptyText: 'Nothing found!',
        pageSize: 10,
        validate: (val: string): string | boolean => {
          return val ? true : 'Type something!'
        },
        searchOpts: {
          keys: ['readableId'],
          shouldSort: true,
          threshold: 0.25,
          ignoreLocation: true,
        },
        displayKey: 'readableId',
        options: commands,
        footer: (currentChoices: Choices, index: number): string | undefined => {
          const cmd = commands.find(c => c.readableId === currentChoices.getChoice(index).value)
          if (cmd && cmd.summary) return cmd.summary
        },
      },
    ])

    if (command === 'help') {
      return this.config.runCommand(toStandardizedId(command, this.config), [])
    }

    return this.config.runCommand('help', [toStandardizedId(command, this.config)])
  }
}

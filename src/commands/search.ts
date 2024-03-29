/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {Command, loadHelpClass, toConfiguredId, toStandardizedId} from '@oclif/core'
import autocomplete from 'inquirer-autocomplete-standalone'

export default class Search extends Command {
  public static description = 'Once you select a command, hit enter and it will show the help for that command.'
  public static summary = 'Search for a command.'

  public async run(): Promise<unknown> {
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

    const command = await autocomplete<string>({
      emptyText: 'Nothing found!',
      message: 'Search for a command',
      pageSize: 10,
      async source(input) {
        return input ? commandChoices.filter((c) => c.name.includes(input)) : commandChoices
      },
    })

    const Help = await loadHelpClass(this.config)
    const help = new Help(this.config, this.config.pjson.oclif.helpOptions ?? this.config.pjson.helpOptions)
    return help.showHelp([toStandardizedId(command, this.config)])
  }
}

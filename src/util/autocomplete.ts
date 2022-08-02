/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * TODO: this functionality should eventually be moved to a separate library so that other plugins can use it.
 *
 * NOTE: this code was adapted from https://github.com/mokkabonna/inquirer-autocomplete-prompt
 */

/* eslint-disable unicorn/no-array-for-each */
/* eslint-disable no-void */
/* eslint-disable no-negated-condition */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import {Interface as ReadLineInterface} from 'node:readline'
import ansiEscapes = require('ansi-escapes');
import Base = require('inquirer/lib/prompts/base');
import InquirerChoices = require('inquirer/lib/objects/choices');
import observe = require('inquirer/lib/utils/events');
import utils = require('inquirer/lib/utils/readline');
import Paginator = require('inquirer/lib/utils/paginator');
import {takeWhile} from 'rxjs/operators'
import Choice = require('inquirer/lib/objects/choice');
import * as Inquirer from 'inquirer'
import chalk from 'chalk'
import Fuse from 'fuse.js'

type ReadLine = ReadLineInterface & { history?: string[]; line: string };

type SearchOptions = Fuse.IFuseOptions<Record<string, unknown>>;

export class Choices extends InquirerChoices {
  public constructor(choices: string[], options: { separator?: string } = {}) {
    // @ts-expect-error
    super(choices, options)
  }
}

export class AutocompleteSearch extends Base {
  public opt!: Inquirer.prompts.PromptOptions<Inquirer.Question> & {
    suggestOnly: boolean;
    loop: boolean;
    emptyText: string;
    pageSize: number;
    searchText: string;
    footer: (currentChoices: Choices, index: number, output: string) => string;
    searchOpts: SearchOptions;
    options: Array<Record<string, unknown>>;
    displayKey: string;
  };

  private currentChoices: Choices;
  private firstRender: boolean;
  private selected = 0;
  private initialValue: string;
  private paginator: Paginator;
  private done!: (state: unknown) => void;
  private answer!: string;
  private shortAnswer!: string;
  private answerName!: string;
  private searching!: boolean;
  private nbChoices!: number;
  private searchedOnce!: boolean;
  private lastSearchTerm!: string | undefined;
  private fuse: Fuse<Record<string, unknown>>;

  public constructor(questions: Inquirer.Question[], public rl: ReadLine, answers: Record<string, any>) {
    super(questions, rl, answers)
    if (!this.opt.searchOpts) {
      this.throwParamError('searchOpts')
    }

    this.fuse = new Fuse(this.opt.options, this.opt.searchOpts)

    this.currentChoices = new Choices([], {})

    this.firstRender = true

    this.initialValue = this.opt.default as string

    // If suggestOnly is not set, we don't want to auto-populate the input, so we set the default value to null
    if (!this.opt.suggestOnly) {
      this.opt.default = null
    }

    const shouldLoop = this.opt.loop === undefined ? true : this.opt.loop
    this.paginator = new Paginator(this.screen, {isInfinite: shouldLoop})
  }

  public async _run(cb: (state: unknown) => void): Promise<AutocompleteSearch> {
    this.done = cb

    if (Array.isArray(this.rl.history)) {
      this.rl.history = []
    }

    const events = observe(this.rl)

    // eslint-disable-next-line unicorn/consistent-function-scoping
    const dontHaveAnswer = (): boolean => this.answer === undefined

    events.line.pipe(takeWhile(dontHaveAnswer)).forEach(this.onSubmit.bind(this))
    // @ts-ignore
    events.keypress.pipe(takeWhile(dontHaveAnswer)).forEach(this.onKeypress.bind(this))

    // Call once at init
    this.search()

    return Promise.resolve(this)
  }

  public render(error?: string): void {
    // Render question
    let content = this.getQuestion()
    let bottomContent = ''

    if (this.firstRender) {
      const suggestText = this.opt.suggestOnly ? ', tab to autocomplete' : ''
      content += chalk.dim(`(Use arrow keys or type to search ${suggestText})`)
    }

    // Render choices or answer depending on the state
    if (this.status === 'answered') {
      content += chalk.cyan(this.shortAnswer || this.answerName || this.answer)
    } else if (this.searching) {
      content += this.rl.line
      bottomContent += '  ' + chalk.dim(this.opt.searchText || 'Searching...')
    } else if (this.nbChoices) {
      const choicesStr = renderList(this.currentChoices, this.selected)
      content += this.rl.line
      const indexPosition = this.selected
      let realIndexPosition = 0
      this.currentChoices.choices.every((choice, index) => {
        if (index > indexPosition) {
          return false
        }

        if (choice.type === 'separator') {
          return false
        }

        const name = choice.name
        realIndexPosition += name ? name.split('\n').length : 0
        return true
      })
      bottomContent += this.paginator.paginate(choicesStr, realIndexPosition, this.opt.pageSize)
      if (this.opt.footer) {
        const footer = this.opt.footer(this.currentChoices, this.selected, bottomContent)
        if (footer) bottomContent += `\n${new Inquirer.Separator().line}\n${footer}`
      }
    } else {
      content += this.rl.line
      bottomContent += `  ${chalk.yellow(this.opt.emptyText || 'No results...')}`
    }

    if (error) {
      bottomContent += `\n${chalk.red('>> ')}${error}`
    }

    this.firstRender = false

    this.screen.render(content, bottomContent)
  }

  public onSubmit(line: string): void {
    let lineOrRl = line || this.rl.line

    // only set default when suggestOnly (behaving as input prompt)
    // list prompt does only set default if matching actual item in list
    if (this.opt.suggestOnly && !lineOrRl) {
      lineOrRl = (this.opt.default === null ? '' : this.opt.default) as string
    }

    if (typeof this.opt.validate === 'function') {
      const checkValidationResult = (validationResult: string | boolean): void => {
        if (validationResult !== true) {
          this.render(validationResult || 'Enter something, tab to autocomplete!')
        } else {
          this.onSubmitAfterValidation(lineOrRl)
        }
      }

      let validationResult: string | boolean | Promise<string | boolean>
      if (this.opt.suggestOnly) {
        validationResult = this.opt.validate(lineOrRl, this.answers)
      } else {
        const choice = this.currentChoices.getChoice(this.selected)
        validationResult = this.opt.validate(choice, this.answers)
      }

      if (typeof validationResult === 'object' && typeof validationResult.then === 'function') {
        void validationResult.then(checkValidationResult)
      } else {
        checkValidationResult(validationResult as string | boolean)
      }
    } else {
      this.onSubmitAfterValidation(lineOrRl)
    }
  }

  public onSubmitAfterValidation(line: string): void {
    let choice = {} as Choice
    if (this.nbChoices <= this.selected && !this.opt.suggestOnly) {
      this.rl.write(line)
      this.search(line)
      return
    }

    if (this.opt.suggestOnly) {
      choice.value = line || this.rl.line
      this.answer = line || this.rl.line
      this.answerName = line || this.rl.line
      this.shortAnswer = line || this.rl.line
      this.rl.line = ''
    } else if (this.nbChoices) {
      choice = this.currentChoices.getChoice(this.selected) as Choice
      this.answer = choice.value as string
      this.answerName = choice.name
      this.shortAnswer = choice.short
    } else {
      this.rl.write(line)
      this.search(line)
      return
    }

    // @ts-expect-error
    // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
    const value = this.opt.filter(choice.value, this.answers) as string
    choice.value = value
    this.answer = value

    if (this.opt.suggestOnly) {
      this.shortAnswer = value
    }

    this.status = 'answered'
    // Rerender prompt
    this.render()
    this.screen.done()
    this.done(choice.value)
  }

  public search(searchTerm?: string): void {
    this.selected = 0

    // Only render searching state after first time
    if (this.searchedOnce) {
      this.searching = true
      this.currentChoices = new Choices([], {})
      this.render() // Now render current searching state
    } else {
      this.searchedOnce = true
    }

    this.lastSearchTerm = searchTerm

    const choices = searchTerm ?
      (this.fuse.search(searchTerm).map(el => el.item[this.opt.displayKey]) as string[]) :
      this.opt.options.map(el => el[this.opt.displayKey]).sort()

    this.currentChoices = new Choices(choices as string[], {})

    // @ts-expect-error
    const realChoices = this.currentChoices.filter(choice => choice.type !== 'separator' && !choice.disabled)
    this.nbChoices = realChoices.length

    const selectedIndex = realChoices.findIndex(
      // @ts-expect-error
      choice => choice === this.initialValue || choice.value === this.initialValue,
    )

    if (selectedIndex >= 0) {
      this.selected = selectedIndex
    }

    this.searching = false

    this.render()
  }

  public ensureSelectedInRange(): void {
    const selectedIndex = Math.min(this.selected, this.nbChoices) // Not above currentChoices length - 1
    this.selected = Math.max(selectedIndex, 0) // Not below 0
  }

  public onKeypress(e: { key: { name: string; ctrl: boolean }; value: string }): void {
    let len: number
    const keyName = (e.key && e.key.name) || undefined

    if (keyName === 'tab' && this.opt.suggestOnly) {
      if (this.currentChoices.getChoice(this.selected)) {
        this.rl.write(ansiEscapes.cursorLeft)
        const autoCompleted = this.currentChoices.getChoice(this.selected).value as string
        this.rl.write(ansiEscapes.cursorForward(autoCompleted.length))
        this.rl.line = autoCompleted
        this.render()
      }
    } else if (keyName === 'down' || (keyName === 'n' && e.key.ctrl)) {
      len = this.nbChoices
      this.selected = this.selected < len - 1 ? this.selected + 1 : 0
      this.ensureSelectedInRange()
      this.render()
      utils.up(this.rl, 2)
    } else if (keyName === 'up' || (keyName === 'p' && e.key.ctrl)) {
      len = this.nbChoices
      this.selected = this.selected > 0 ? this.selected - 1 : len - 1
      this.ensureSelectedInRange()
      this.render()
    } else {
      this.render() // Render input automatically
      // Only search if input have actually changed, not because of other keypresses
      if (this.lastSearchTerm !== this.rl.line) {
        this.search(this.rl.line) // Trigger new search
      }
    }
  }
}

function renderList(choices: Choices, pointer: number): string {
  let output = ''
  let separatorOffset = 0

  choices.forEach((choice, i) => {
    if (choice.type === 'separator') {
      separatorOffset += 1
      output += `  ${choice}\n`
      return
    }

    if (choice.disabled) {
      separatorOffset += 1
      output += `  - ${choice.name} ( ${typeof choice.disabled === 'string' ? choice.disabled : 'Disabled'})\n`
      return
    }

    const isSelected = i - separatorOffset === pointer
    // eslint-disable-next-line no-useless-concat
    let line = (isSelected ? '❯' + ' ' : '  ') + choice.name

    if (isSelected) {
      line = chalk.cyan(line)
    }

    output += `${line}\n`
  })

  return output.replace(/\n$/, '')
}

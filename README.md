@oclif/plugin-search
=================

A `search` command for your oclif CLI

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/oclif-plugin-search.svg)](https://npmjs.org/package/oclif-plugin-search)
[![CircleCI](https://circleci.com/gh/oclif/plugin-search/tree/main.svg?style=shield)](https://circleci.com/gh/oclif/plugin-search/tree/main)
[![Downloads/week](https://img.shields.io/npm/dw/oclif-plugin-search.svg)](https://npmjs.org/package/oclif-plugin-search)
[![License](https://img.shields.io/npm/l/oclif-plugin-search.svg)](https://github.com/oclif/plugin-search/blob/main/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @oclif/plugin-search
$ @oclif/plugin-search COMMAND
running command...
$ @oclif/plugin-search (--version)
@oclif/plugin-search/0.0.1 darwin-x64 node-v17.1.0
$ @oclif/plugin-search --help [COMMAND]
USAGE
  $ @oclif/plugin-search COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`@oclif/plugin-search hello PERSON`](#oclifplugin-search-hello-person)
* [`@oclif/plugin-search hello world`](#oclifplugin-search-hello-world)

## `@oclif/plugin-search hello PERSON`

Say hello

```
USAGE
  $ @oclif/plugin-search hello [PERSON] -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Whom is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ oex hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [dist/commands/hello/index.ts](https://github.com/oclif/plugin-search/blob/v0.0.1/dist/commands/hello/index.ts)_

## `@oclif/plugin-search hello world`

Say hello world

```
USAGE
  $ @oclif/plugin-search hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ oex hello world
  hello world! (./src/commands/hello/world.ts)
```
<!-- commandsstop -->

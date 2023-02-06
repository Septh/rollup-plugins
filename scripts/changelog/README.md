# changelog
A script to generate/update a CHANGELOG.md file for a plugin, based on news commits since the last _published_ tag.

To use:
- make sure your are on the target plugin branch.
- cd to the plugin directory.
- type `npx changelog [options]`.

The script will:
- read the current version number from `package.json`.
- read the last published version from the npm regsitry.
- gather commit messages since last tag for the plugin. Only messages that follow the conventional commit format and apply to the plugin (eg, `feat(<plugin>): Something`) are considered, other are silently ignored.
- update `CHANGELOG.md` with those messages grouped by kind.
- decide the next version number (ie., major, minor, patch or pre-release bump) based on what changed.
- use npm to actually update the version number in `package.json` and `package-lock.json`.
- commit `package-lock.json`, `package.json`, `CHANGELOG.md` as well as any other staged file in the plugin directory.
- tag this commit as `<plugin>-v<new-version>`.

Options:

| Option | Description
|-|-
| `--version`, `-v` | Print version number and exit script
| `--help`, `-h` | Display usage and exit script
| `--dry`, `--dry-run` or `--preview` | Run but do not modify files
| `--major`, `--minor`, `--patch`,<br>`--premajor`, `--preminor`, `--prepatch`<br>or `--prerelase` | Use said bump instead of guessing it
| `--preid <id>` | Use `id` as pre-release id (eg. `alpha`, `rc`...)

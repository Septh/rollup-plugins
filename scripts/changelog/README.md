# changelog
A script to generate/update a CHANGELOG.md file for a plugin, based on news commits since last tag.

To use:
- make sure your are on the target plugin branch.
- cd to the plugin directory.
- type `npm run changelog -- <options>` or `npx changelog <options>`.

The script will:
- get the current version number from `package.json`.
- gather commit messages since last tag for the plugin. Only messages that follow the conventional commit format and apply to the plugin are considered (eg, `feat(<plugin>): Something`), other are silently ignored.
- update `CHANGELOG.md` with those messages grouped by kind.
- decide the next version number (ie., major, minor, patch or pre-release bump) based on what changed.
- use npm to actually update the version number in `package.json` and `package-lock.json`.
- commit `package-lock.json`, `package.json`, `CHANGELOG.md` as well as any other staged file in the plugin directory.
- tag this commit as `<plugin>-v<new-version>`.

Options:

| `--dry`, `--dry-run` or `--preview` | Run but do not modify files
|-|-
| `--major`, `--minor`, `--patch`,<br>`--premajor`, `--preminor`, `--prepatch`<br>or `--prerelase` | Use said bump instead of guessing it
| `--preid <id>` | Use said `id` as pre-release id (eg. `alpha`, `rc`...)

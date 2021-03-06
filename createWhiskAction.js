/*
Copyright 2018 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/
'use strict';

const chalk = require('chalk');
const commander = require('commander');
const packageJson = require('./package.json');
const path = require('path');
const validateProjectName = require('validate-npm-package-name');
const fs = require('fs-extra');
const os = require('os');
const envinfo = require('envinfo');
const isReachable = require('is-reachable');
const spawn = require('cross-spawn');

// These files should be allowed to remain on a failed install,
// but then silently removed during the next create.
const errorLogFilePatterns = [
  'npm-debug.log',
  'yarn-error.log',
  'yarn-debug.log'
];

let projectName;
let packageName;

const program = new commander.Command(packageJson.name)
  .version(packageJson.version, '-v, --version')
  .arguments('<project-directory>')
  .usage(`${chalk.green('<project-directory>')} [options]`)
  .action(name => {
    if (name.includes('/')) {
      [packageName, projectName] = name.split('/');
    } else {
      packageName = null;
      projectName = name;
    }
  })
  .option('--verbose', 'print additional logs')
  .option('--info', 'print environment debug info')
  .option('--use-npm')
  .option('--web', 'make it a web action')
  .allowUnknownOption()
  .on('--help', () => {
    console.log(`    Only ${chalk.green('<project-directory>')} is required.`);
    console.log();
  })
  .parse(process.argv);

if (typeof projectName === 'undefined') {
  console.error('Please specify the project directory:');
  console.log(
    `  ${chalk.cyan(program.name())} ${chalk.green('<project-directory>')}`
  );
  console.log();
  console.log('For example:');
  console.log(
    `  ${chalk.cyan(program.name())} ${chalk.green('my-first-action')}`
  );
  console.log();
  console.log(
    `Run ${chalk.cyan(`${program.name()} --help`)} to see all options.`
  );
  process.exit(1);
}

let useWeb = false;
if (program.web) useWeb = true;

createAction(projectName, packageName, useWeb);

function createAction(name, packageName, useWeb) {
  const root = path.resolve(name);
  const appName = path.basename(root);
  const actionName = packageName === null ? name : `${packageName}/${name}`;

  packageExists(packageName).then(exists => {
    if (exists) {
      console.log(
        `OpenWhisk package ${chalk.green(packageName)} already exists.`
      );
      completeActionSetup(root, appName, actionName, useWeb);
    } else {
      createPackage(packageName).then(() =>
        completeActionSetup(root, appName, actionName, useWeb)
      );
    }
  });
}

function completeActionSetup(root, appName, actionName, useWeb) {
  checkAppName(appName);
  fs.ensureDirSync(appName);

  if (!isSafeToCreateProjectIn(root, appName)) {
    process.exit(1);
  }

  console.log(`Creating a new OpenWhisk action in ${chalk.green(root)}.`);
  console.log();

  // Create package.json file
  const webDeploy = useWeb ? '--web true' : '';
  const packageJson = {
    name: appName,
    version: '0.1.0',
    private: true,
    main: 'dist/bundle.js',
    scripts: {
      build: 'webpack --config config/webpack.config.js --mode production',
      deploy: `wsk action update ${actionName} dist/bundle.js ${webDeploy}`
    }
  };
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2) + os.EOL
  );

  // write index.js file
  const srcFolder = path.resolve(appName, 'src');
  const srcFile = useWeb ? 'index.web.js' : 'index.js';
  fs.ensureDirSync(srcFolder);
  fs.copySync(
    path.join(__dirname, 'template', srcFile),
    path.join(srcFolder, 'index.js')
  );

  // write webpack config
  const webpackConfigFolder = path.resolve(appName, 'config');
  fs.ensureDirSync(webpackConfigFolder);
  fs.copySync(
    path.join(__dirname, 'template', 'webpack.config.js'),
    path.join(webpackConfigFolder, 'webpack.config.js')
  );

  // install npm dependencies
  const originalDirectory = process.cwd();
  process.chdir(root);
  if (!checkThatNpmCanReadCwd()) {
    process.exit(1);
  }

  run(root, appName, originalDirectory);
}

function packageExists(name) {
  return new Promise((resolve, reject) => {
    console.log(`Checking for OpenWhisk package ${chalk.green(name)}.`);
    console.log();
    let command;
    let args;
    command = 'wsk';
    args = ['package', 'get', `${name}`];

    const child = spawn(command, args);
    child.on('close', code => {
      if (code !== 0) {
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

function createPackage(name) {
  return new Promise((resolve, reject) => {
    console.log(`Creating a new OpenWhisk package ${chalk.green(name)}.`);
    console.log();
    let command;
    let args;
    command = 'wsk';
    args = ['package', 'create', `${name}`];

    const child = spawn(command, args);
    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`
        });
        return;
      }
      console.log(
        `Successfully created a new OpenWhisk package ${chalk.green(name)}.`
      );
      console.log();
      resolve();
    });
  });
}

function checkAppName(appName) {
  const validationResult = validateProjectName(appName);
  if (!validationResult.validForNewPackages) {
    console.error(
      `Could not create a project called ${chalk.red(
        `"${appName}"`
      )} because of npm naming restrictions:`
    );
    printValidationResults(validationResult.errors);
    printValidationResults(validationResult.warnings);
    process.exit(1);
  }
}

// If project only contains files generated by GH, it’s safe.
// Also, if project contains remnant error logs from a previous
// installation, lets remove them now.
function isSafeToCreateProjectIn(root, name) {
  const validFiles = [
    '.DS_Store',
    'Thumbs.db',
    '.git',
    '.gitignore',
    'README.md',
    'LICENSE',
    'web.iml',
    '.npmignore',
    'mkdocs.yml',
    'docs',
    '.travis.yml',
    '.gitlab-ci.yml',
    '.gitattributes'
  ];
  console.log();

  const conflicts = fs
    .readdirSync(root)
    .filter(file => !validFiles.includes(file))
    // Don't treat log files from previous installation as conflicts
    .filter(
      file => !errorLogFilePatterns.some(pattern => file.indexOf(pattern) === 0)
    );

  if (conflicts.length > 0) {
    console.log(
      `The directory ${chalk.green(name)} contains files that could conflict:`
    );
    console.log();
    for (const file of conflicts) {
      console.log(`  ${file}`);
    }
    console.log();
    console.log(
      'Either try using a new directory name, or remove the files listed above.'
    );

    return false;
  }

  // Remove any remnant files from a previous installation
  const currentFiles = fs.readdirSync(path.join(root));
  currentFiles.forEach(file => {
    errorLogFilePatterns.forEach(errorLogFilePattern => {
      // This will catch `(npm-debug|yarn-error|yarn-debug).log*` files
      if (file.indexOf(errorLogFilePattern) === 0) {
        fs.removeSync(path.join(root, file));
      }
    });
  });
  return true;
}

function checkThatNpmCanReadCwd() {
  const cwd = process.cwd();
  let childOutput = null;
  try {
    // Note: intentionally using spawn over exec since
    // the problem doesn't reproduce otherwise.
    // `npm config list` is the only reliable way I could find
    // to reproduce the wrong path. Just printing process.cwd()
    // in a Node process was not enough.
    childOutput = spawn.sync('npm', ['config', 'list']).output.join('');
  } catch (err) {
    // Something went wrong spawning node.
    // Not great, but it means we can't do this check.
    // We might fail later on, but let's continue.
    return true;
  }
  if (typeof childOutput !== 'string') {
    return true;
  }
  const lines = childOutput.split('\n');
  // `npm config list` output includes the following line:
  // "; cwd = C:\path\to\current\dir" (unquoted)
  // I couldn't find an easier way to get it.
  const prefix = '; cwd = ';
  const line = lines.find(line => line.indexOf(prefix) === 0);
  if (typeof line !== 'string') {
    // Fail gracefully. They could remove it.
    return true;
  }
  const npmCWD = line.substring(prefix.length);
  if (npmCWD === cwd) {
    return true;
  }
  console.error(
    chalk.red(
      `Could not start an npm process in the right directory.\n\n` +
        `The current directory is: ${chalk.bold(cwd)}\n` +
        `However, a newly started npm process runs in: ${chalk.bold(
          npmCWD
        )}\n\n` +
        `This is probably caused by a misconfigured system terminal shell.`
    )
  );
  if (process.platform === 'win32') {
    console.error(
      chalk.red(`On Windows, this can usually be fixed by running:\n\n`) +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKCU\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n` +
        `  ${chalk.cyan(
          'reg'
        )} delete "HKLM\\Software\\Microsoft\\Command Processor" /v AutoRun /f\n\n` +
        chalk.red(`Try to run the above two lines in the terminal.\n`) +
        chalk.red(
          `To learn more about this problem, read: https://blogs.msdn.microsoft.com/oldnewthing/20071121-00/?p=24433/`
        )
    );
  }
  return false;
}

function install(root, dependencies, isOnline) {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    command = 'npm';
    args = [
      'install',
      '--save-dev',
      '--save-exact',
      '--loglevel',
      'error'
    ].concat(dependencies);

    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`
        });
        return;
      }
      resolve();
    });
  });
}

function run(root, appName, originalDirectory) {
  const allDependencies = ['webpack', 'webpack-command'];

  console.log('Installing packages. This might take a couple of minutes.');
  checkIfOnline()
    .then(isOnline => ({
      isOnline: isOnline
    }))
    .then(info => {
      const isOnline = info.isOnline;
      const packageName = info.packageName;
      console.log(
        `Installing ${chalk.cyan('webpack')}, ${chalk.cyan(
          'webpack-command'
        )}...`
      );
      console.log();

      return install(root, allDependencies, isOnline).then(() => packageName);
    })
    .then(() => {
      console.log();
      console.log(
        `Success! Created ${chalk.green(appName)} at ${chalk.green(root)}`
      );
      console.log('Inside that directory, you can run several commands:');
      console.log();
      console.log(chalk.cyan('  npm run build'));
      console.log('    Bundles the app into static files for production.');
      console.log();
      console.log(chalk.cyan('  npm run deploy'));
      console.log('    Deploys the action to OpenWhisk.');
      console.log();
      console.log('Happy hacking!');
    })
    .catch(reason => {
      console.log();
      console.log('Aborting installation.');
      if (reason.command) {
        console.log(`  ${chalk.cyan(reason.command)} has failed.`);
      } else {
        console.log(chalk.red('Unexpected error. Please report it as a bug:'));
        console.log(reason);
      }
      console.log();

      // On 'exit' we will delete these files from target directory.
      const knownGeneratedFiles = [
        'package.json',
        'package-lock.json',
        'node_modules',
        'config',
        'src'
      ];
      const currentFiles = fs.readdirSync(path.join(root));
      currentFiles.forEach(file => {
        knownGeneratedFiles.forEach(fileToMatch => {
          // This remove all of knownGeneratedFiles.
          if (file === fileToMatch) {
            console.log(`Deleting generated file... ${chalk.cyan(file)}`);
            fs.removeSync(path.join(root, file));
          }
        });
      });
      const remainingFiles = fs.readdirSync(path.join(root));
      if (!remainingFiles.length) {
        // Delete target folder if empty
        console.log(
          `Deleting ${chalk.cyan(`${appName}/`)} from ${chalk.cyan(
            path.resolve(root, '..')
          )}`
        );
        process.chdir(path.resolve(root, '..'));
        fs.removeSync(path.join(root));
      }
      console.log('Done.');
      process.exit(1);
    });
}

function checkIfOnline() {
  return isReachable('npmjs.org');
}

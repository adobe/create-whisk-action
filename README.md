# Create Whisk Action

Create OpenWhisk actions with no build configuration.

## Quick Overview

```
npx create-whisk-action my-action
cd my-action
```

Then open the `my-action` folder in your favourite code editor and build your action like normal.

When you’re ready to deploy to production, create a minified bundle with `npm run build`.

### Get Started Immediately

You don’t need to install or configure tools like Webpack or Babel.
They are preconfigured and hidden so that you can focus on the code.

Just create a project, and you’re good to go.

## Creating an Action

You’ll need to have Node >= 6 on your local development machine (but it’s not required on the server). You can use nvm (macOS/Linux) or nvm-windows to easily switch Node versions between different projects.

To create a new action, run a the command:

```
npx create-whisk-action my-action
```

To create a web action, add the `--web` option.

```
npx create-whisk-action my-action --web
```

It will create a directory called my-action inside the current folder.
Inside that directory, it will generate the initial project structure and install the transitive dependencies:

```
my-action
├── config
│   └── webpack.config.js
├── index.js
├── node_modules
├── package-lock.json
└── package.json
```

No configuration or complicated folder structures, just the files you need to build your app.

Once the installation is done, you can open your project folder:

```
cd my-action
```

Inside the newly created project, you can run some built-in commands:

### `npm run build`

Builds a webpack bundle as the file `dist/bundle.js` which can be deployed as an action.

### `npm run deploy`

Deploys the action to your OpenWhisk instance.

## Contributing

We'd love to have your helping hand on `create-whisk-action`! See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for more information on what we're looking for and how to get started.

## Acknowledgements

We are grateful to the authors of existing related projects for their ideas. This package owes it's inspiration to `create-react-app`.

## License

Create Whisk Action is open source software [licensed as Apache-2.0](blob/master/LICENSE).

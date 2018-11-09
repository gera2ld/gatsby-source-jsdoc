# gatsby-source-jsdoc

[![NPM](https://img.shields.io/npm/v/gatsby-source-jsdoc.svg)](https://npm.im/gatsby-source-jsdoc)

Uses [jsdoc-api](https://github.com/jsdoc2md/jsdoc-api) to generate JavaScript documentation.

This plugin requires an instance of [gatsby-source-filesystem](https://www.gatsbyjs.org/packages/gatsby-source-filesystem/) to provide the source files. Then `gatsby-source-jsdoc` will generate Markdown files for [gatsby-transformer-remark](https://www.gatsbyjs.org/packages/gatsby-transformer-remark/) to process.

## Install

`npm install --save gatsby-source-jsdoc

## How to use

Add the plugin to your `gatsby-config.js` and ensure `sourceDir` is pointed to the directory of your JavaScript source files.

```javascript
plugins: [
  {
    resolve: 'gatsby-source-filesystem',
    options: {
      name: 'source',
      path: `${__dirname}/src/`,
    },
  },
  {
    resolve: 'gatsby-source-jsdoc',
    options: {
      sourceDir: `${__dirname}/src/`,
    },
  },
]
```

const babelParser = require('@babel/parser');

const parserOptions = {
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  allowSuperOutsideMethod: true,
  plugins: [
    'estree',
    'jsx',
    'typescript',
    'asyncGenerators',
    'bigInt',
    'classPrivateProperties',
    'classProperties',
    'decorators2',
    'doExpressions',
    'dynamicImport',
    'exportDefaultFrom',
    'exportNamespaceFrom',
    'functionBind',
    'functionSent',
    'importMeta',
    'numericSeparator',
    'objectRestSpread',
    'optionalCatchBinding',
    'optionalChaining'
  ],
  ranges: true,
  sourceType: 'unambiguous',
};

function parse(source, filename) {
  let ast;
  try {
    ast = babelParser.parse(source, parserOptions);
    // console.log(JSON.stringify(ast, null, 2));
  } catch (e) {
    console.error('Unable to parse %s: %s', filename, e.message);
  }
  return ast;
}

exports.parse = parse;

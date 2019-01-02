function parse(comment, extra = {}) {
  const { type, value } = comment;
  if (type !== 'CommentBlock' || !value.startsWith('*')) return;
  const lines = value.slice(1)
  .trimRight()
  .split('\n')
  .map(line => line.replace(/^\s?\*\s?/, ''));
  const doc = {
    ...extra,
    kind: 'block',
    desc: '',
    params: [],
    returns: [],
    examples: [],
    comment,
  };
  let block;
  const flushBlock = () => {
    if (!block) return;
    if (block.tag === 'desc') {
      const content = getBlockContent(block.contents);
      if (content) doc.desc = `${doc.desc || ''}\n${content}`;
    } else if (block.tag === 'param') {
      doc.params = [
        ...doc.params || [],
        getParamItem(block),
      ];
    } else if (block.tag === 'returns') {
      doc.returns = [
        ...doc.returns || [],
        getParamItem(block),
      ];
    } else if (block.tag === 'example') {
      const [caption, ...code] = block.contents;
      const contents = [];
      if (caption) contents.push(caption);
      contents.push(
        '```js',
        ...code,
        '```',
      );
      doc.examples = [
        ...doc.examples || [],
        { content: contents.join('\n') },
      ];
    }
    block = null;
  };
  for (const line of lines) {
    const tagMatch = line.match(/^\s*@(\w+)(\s.*)?$/);
    if (tagMatch) {
      const [, tag, firstRow] = tagMatch;
      if ([
        'desc',
        'example',
      ].includes(tag)) {
        flushBlock();
        block = {
          tag,
          contents: [firstRow],
        };
      } else if ([
        'param',
        'returns',
      ].includes(tag)) {
        flushBlock();
        block = {
          ...parseParam(firstRow, tag),
          tag,
        };
      } else if ([
        'name',
        'alias',
      ].includes(tag)) {
        flushBlock();
        doc[tag] = firstRow.trim();
      } else if (tag === 'file') {
        doc.kind = tag;
      }
    } else {
      if (!block) {
        block = {
          tag: 'desc',
          contents: [''],
        };
      }
      block.contents.push(line);
    }
  }
  flushBlock();
  return doc;
}

function getBlockContent(contents) {
  return contents[0] ? contents.join('\n') : contents.slice(1).join('\n');
}

function getParamItem(block) {
  return {
    name: block.name,
    types: block.types,
    optional: block.optional,
    default: block.default,
    desc: getBlockContent(block.contents),
  };
}

function parseParam(raw, tag) {
  // raw starts with a space
  const parts = raw.match(/^(?:\s+(\{[^}]+\}))?(?:\s+([\w.]+|\[[^\]]+\]))?(?:\s+(.*))?$/);
  if (!parts) {
    throw new Error(`Invalid @${tag}: ${raw}`);
  }
  const [, rawType, rawName, rawDesc] = parts;
  const props = {
    name: '',
    types: [],
    optional: false,
    default: '',
    contents: [],
  };
  if (rawType) parseParamType(props, rawType);
  if (rawName) parseParamName(props, rawName);
  props.contents = [(rawDesc || '').trim()];
  return props;
}

function parseParamType(props, raw) {
  const types = raw.slice(1, -1).split('|').map(s => s.trim());
  props.types = types;
}

function parseParamName(props, raw) {
  if (/^\[.*\]$/.test(raw)) {
    props.optional = true;
    raw = raw.slice(1, -1);
  }
  const [name, defaultValue] = raw.split('=');
  if (name) props.name = name;
  if (defaultValue) props.default = defaultValue;
}

exports.parse = parse;

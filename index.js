'use strict';

const fs = require('fs');
const http = require('http');
const cp = require('child_process');
const qs = require('querystring');
const _ = require('lodash');

const dependencies = _.chain(require('./package'))
  .filter((v, key) => key.toLowerCase().indexOf('dependencies') >= 0)
  .reduce((a, v) => _.extend(a, v), {})
  .map((ver, name) => name)
  .filter((name) => name.indexOf('eslint-') === 0 && name.indexOf('eslint-plugin') === -1)
  .value();

const ruleMap = {
  'off':   0,
  'warn':  1,
  'error': 2,
};

const cssClassRuleMap = {
  '0':         'rule-disable',
  '1':         'rule-warning',
  '2':         'rule-error',
  'undefined': 'rule-empty',
};

const cssClassSeverityMap = {
  '1':         'warning',
  '2':         'danger',
  'undefined': '',
};

function htmlRuleFormatter(ruleVal, compareWith) {
  if (compareWith) {
    //TODO
  }
  let result = `<span class="${cssClassRuleMap[ruleVal.value]}">${ruleVal.value}</span>`;
  if (ruleVal.options) {
    result += `<pre style="max-width: ${Math.floor(100 / (dependencies.length + 1))}vw;overflow: auto;">${JSON.stringify(ruleVal.options, null, 2)}</pre>`;
  }
  return result;
}

function doJob(userConfigs = [], userFile = null) {

  const packages = _.chain(dependencies)
    .map((name) => {
      const separators = name.match(/-/g).length;
      if (separators === 1 || separators === 2) {
        return {short: name.substr(name.lastIndexOf('-') + 1), name};
      }
      return {short: name.match(/^(\w+-){2}(\w+)/)[2], name};
    })
    .union([
      {
        name:  'eslint:recommended',
        short: 'recommended'
      }
    ])
    .each((v) => {
      const options = {encoding: 'UTF-8', env: {ESLINT_EXTENDS: v.name}};
      const out = cp.execSync('./node_modules/.bin/eslint index.js --print-config', options);
      v.config = JSON.parse(out);
    })
    .union(_.map(userConfigs, (config, index) => ({
      name:   `user-config-${index}`,
      short:  `u-c-${index}`,
      _user:  true,
      config: JSON.parse(config)
    })))
    //.each((v) => v.module = require(v.name)) ESLINT_EXTENDS
    .value();

  const knownRules = _.chain(packages)
    .map('config')
    .map('rules')
    .map(Object.keys)
    .flatten()
    .uniq()
    .value();


  const rules = _.chain(knownRules)
    .mapKeys((v, k) => v)
    .mapValues((rule) => {
      return _.chain(packages)
        .map(`config.rules.${rule}`)
        .map((ruleVal) => {
          if (_.isArray(ruleVal)) {
            if (ruleVal in ruleMap) {
              return {value: ruleMap[ruleVal[0]], options: _.tail(ruleVal)};
            }
            return {value: ruleVal[0], options: _.tail(ruleVal)};
          } else if (ruleVal in ruleMap) {
            return {value: ruleMap[ruleVal]};
          }
          return {value: ruleVal};
        })
        .map(htmlRuleFormatter)
        .value();
    })
    .value();


  if (userFile && userFile.trim()) {
    fs.writeFileSync('./user-tmp.js', userFile, {encoding: 'utf8', mode: 0o600});
    _.each(packages, (v) => {
      let out;
      if (v._user) {
        fs.writeFileSync('./.user-eslintrc.json', JSON.stringify(v.config), {encoding: 'utf8', mode: 0o600});
        const options = {encoding: 'UTF-8'};
        out = cp.execSync('./node_modules/.bin/eslint user-tmp.js --config .user-eslintrc.json --color --format json; exit 0', options);
      } else {
        const options = {encoding: 'UTF-8', env: {ESLINT_EXTENDS: v.name}};
        out = cp.execSync('./node_modules/.bin/eslint user-tmp.js --color --format json; exit 0', options);
      }
      v.result = JSON.parse(out)[0].messages;
    })
  }
  return toHtml(packages, rules, userConfigs, userFile);
}

function toHtml(packages, rules, userConfigs = [], userFile = null) {
  const tableHead = '<tr>'
    + _.union(['rule-name'], _.map(packages, (v) => `<span title="${v.name}" data-toggle="tooltip" data-placement="bottom">${v.short}</span>`))
      .map((v) => `<td><strong>${v}</strong></td>`)
      .join('')
    + '</tr>';
  const tableBody = _.map(rules, (v, k) => {
      v.unshift(`<a class="fancybox fancybox.iframe rule-name" href="http://eslint.org/docs/rules/${k}"><b>${k}</b></a>`);
      return v.map((v) => `<td>${v}</td>`).join('');
    })
    .reduce((a, v) => `${a}<tr>${v}</tr>`, '');

  const table = `<thead>${tableHead}</thead>
<tbody>${tableBody}</tbody>`;
  let userFileTable = '';
  if (userFile) {
    userFileTable = userFile.split('\n')
      .map((row, line) => [
        [{message: _.escape(row).replace(/\s/g, '&nbsp;')}],
        ..._.map(packages, (v) => _.chain(v.result)
          .filter({line: line + 1})
          .each((lintLine) => {
            lintLine.configOptions = JSON.stringify(v.config.rules[lintLine.ruleId]).replace(/'/g, '&#39;');
            return v;
          })
          .value())
      ])
      .map((tableRow) => tableRow.map((arr) => {
        return '<td>'
          + arr.map((s) => `<span
          ${s.ruleId ? `
          class="${cssClassSeverityMap[s.severity]}"
          title='${s.ruleId}: ${s.configOptions}'
          data-toggle="tooltip"
          data-placement="bottom"
          data-source-column="${s.column}"` : 'class="code-line"'}
          >${s.message}</span>`)
            .join('<br/>')
          + '</td>'
      }).join('\n'))
      .reduce((a, v) => `${a}<tr>${v}</tr>`, '');
    userFileTable = `<table class="table table-hover source-table">
    <thead>${tableHead}</thead>
    <tbody>${userFileTable}</tbody>
    </table>
    `;
  }

  const configRows = _.chain(userConfigs)
    .map((config, i) => `
      <div class="userConfigRow form-group">
        <label for="userConfig${i}">Config json</label>
        <button type="button" class="btn btn-default btn-xs">
          <span class="glyphicon glyphicon-minus"></span>
          Убрать
        </button>
        <textarea class="form-control" rows="8" id="userConfig${i}" name="userConfig[]">${config}</textarea>
      </div>
    `)
    .value()
    .join('\n');

  return `<!DOCTYPE html>
<html>
 <head>
  <meta charset="utf-8">
  <title>Eslint checker</title>
  <style>
  p { color:  navy; }
  </style>
  <!-- Latest compiled and minified CSS -->
<link rel="stylesheet"
href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/css/bootstrap.min.css"
integrity="sha384-1q8mTJOASx8j1Au+a5WDVnPi2lkFfwwEAa8hDDdjZlpLegxhjVME1fgjWPGmkzs7"
crossorigin="anonymous">

<!-- Optional theme -->
<link rel="stylesheet"
href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/css/bootstrap-theme.min.css"
integrity="sha384-fLW2N01lMqjakBkx3l/M9EahuwpSfeNvV63J5ezn3uZzapT0u7EYsXMjQV+0En5r"
 crossorigin="anonymous">

<!-- jquery JavaScript -->
<script src="https://code.jquery.com/jquery-2.2.3.min.js"
integrity="sha384-I6F5OKECLVtK/BL+8iSLDEHowSAfUo76ZL9+kGAgTRdiByINKJaqTPH/QVNS1VDb"
 crossorigin="anonymous"></script>
<script src="https://code.jquery.com/ui/1.11.4/jquery-ui.min.js"
integrity="sha384-YWP9O4NjmcGo4oEJFXvvYSEzuHIvey+LbXkBNJ1Kd0yfugEZN9NCQNpRYBVC1RvA"
crossorigin="anonymous"></script>
<link rel="stylesheet"
href="https://code.jquery.com/ui/1.10.4/themes/ui-darkness/jquery-ui.css"
 crossorigin="anonymous">

<!-- Add fancyBox -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/fancybox/2.1.5/jquery.fancybox.min.css" type="text/css" media="screen" />
<script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/fancybox/2.1.5/jquery.fancybox.pack.js"></script>

<!-- Latest compiled and minified JavaScript -->
<script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/js/bootstrap.min.js"
integrity="sha384-0mSbJDEHialfmuBBQP6A4Qrprq5OVfW37PRR3j5ELqxss1yVqOtnepnHVP9aJ7xS"
crossorigin="anonymous"></script>
<link rel="stylesheet" href="fr.css">
<meta name="viewport" content="width=device-width, initial-scale=1">
 </head>
 <body>
  <div class="container">
    <form role="form" action="/" method="post" class="lint-form">
      ${configRows}
      <div class="form-group">
        <label for="userFile">js file</label>
        <textarea class="form-control" rows="4" id="userFile" name="userFile">${userFile}</textarea>
      </div>
      <div class="btn-group">
        <button type="button" class="btn btn-default add-config">
          <span class="glyphicon glyphicon-plus"></span>
          Добавить конфиг
        </button>
        <button type="submit" class="btn btn-default">
          <span class="glyphicon glyphicon-fire"></span>
          Отправить
        </button>
      </div>
    </form>

    <table class="table table-striped table-hover table-condensed table-responsive">
    ${table}
    </table>

    <hr/>

    ${userFileTable}
  </div>
  <script src="fr.js"></script>
 </body>
</html>`;
}

//fs.writeFileSync('README.md', globalOutput);

const server = http.createServer((req, res) => {
  function response(post) {
    console.log(post);
    res.setHeader('Content-Type', 'text/html');
    try {
      var body = doJob(
        post ? (_.isArray(post['userConfig[]']) ? post['userConfig[]'] : [post['userConfig[]']]) : null,
        post && post.userFile ? post.userFile : null
      );
      res.writeHead(200, {/*'Content-Length': body.length,*/ 'Content-Type': 'text/html'});
      res.end(body);
    } catch (e) {
      res.writeHead(400, {/*'Content-Length': e.length,*/ 'Content-Type': 'text/plain'});
      e ? res.end(String(e) + '\n' + e.stack) : res.end(String(e));
    }
  }

  switch (req.url) {
    case '/':
      if (req.method == 'POST') {
        let postData = '';

        req.on('data', function (data) {
          postData += data;

          // Too much POST data, kill the connection!
          // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
          if (postData.length > 1e6)
            req.connection.destroy();
        });

        req.on('end', function () {
          var post = qs.parse(postData);
          response(post);
        });
      } else {
        response();
      }
      break;
    case '/fr.css':
      res.setHeader('Content-Type', 'text/css');
      fs.readFile('./fr.css', (err, body) => {
        res.writeHead(200, {'Content-Length': body.length, 'Content-Type': 'text/css'});
        res.end(body);
      });
      break;
    case '/fr.js':
      res.setHeader('Content-Type', 'text/plain');
      fs.readFile('./fr.js', (err, body) => {
        res.writeHead(200, {'Content-Length': body.length, 'Content-Type': 'text/plain'});
        res.end(body);
      });
      break;
    default:
      res.writeHead(404);
      res.end(req.body);
      break;
  }
});

server.listen(process.env.PORT || 8080);

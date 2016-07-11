var h = require('./falafel-helper');
var fs = require('fs');
var PO = require('pofile');
var path = require('path');
var loaderUtils = require('loader-utils');

function addToPo(untranslated, po, file) {
    var existing = {};
    po.items.map((key) => {
        existing[key.msgid] = true;
    });
    untranslated.map((key) => {
        if (!existing[key.value]) {
            var item = new PO.Item();
            item.msgid = key.value;
            item.msgstr = '';
            item.references.push(file + ':' + key.line);
            po.items.push(item);
        }
    });
    return po;
}

function translatable(source, translations) {
    var texts = [];
    h(source, (x) => x.type === 'JSXIdentifier' && x.name === 'Text' && x.parent.type === 'JSXOpeningElement' && !translations[x.parent.parent.children[0].value] && (texts.push({
        value: x.parent.parent.children[0].value,
        line: x.loc.start.line
    })));
    return texts;
}

function getPoLocation(cache, translate) {
    return new Promise((resolve, reject) => {
        translate && translate().then(function(response) {
            var translations = response[0].reduce((languages, msg) => {
                if (!languages[msg.iso2Code]) languages[msg.iso2Code] = {};
                languages[msg.iso2Code][msg.dictionaryKey] = true;
                return languages;
            }, {});
            resolve(translations);
        });
    });
}

module.exports = function(source) {
    if (source.indexOf('<Text') === -1) {
        return source;
    }
    var callback = this.async();
    var loaderOptions = loaderUtils.parseQuery(this.query);
    getPoLocation(loaderOptions.path, this.options.closures.translate).then((translations) => {
        Object.keys(translations).map((language) => {
            var untranslated = translatable(source, translations[language]);
            if (untranslated.length) {
                var languageFile = path.dirname(loaderOptions.path) + path.sep + 'messages.' + language + '.po';
                var po = new PO();
                if (fs.existsSync(languageFile)) {
                    po = PO.parse(fs.readFileSync(languageFile).toString());
                }
                po = addToPo(untranslated, po, this.resourcePath);
                fs.writeFileSync(languageFile, po.toString());
            }
        });
        callback(null, source);
    }).catch((e) => {
        callback(null, source);
    });
};

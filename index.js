var h = require('./falafel-helper');
var fs = require('fs');
var PO = require('pofile');
var path = require('path');
var loaderUtils = require('loader-utils');

function addToPo(untranslated, po, file) {
    untranslated.map((key) => {
        var item = new PO.Item();
        item.msgid = key.value;
        item.msgstr = '';
        item.references.push(file + ':' + key.line);
        po.items.push(item);
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
        var cachePath = path.dirname(cache);
        var existingFile = {};
        var poFiles = [];
        translate && translate().then(function(response) {
            var translations = response[0].reduce((languages, msg) => {
                if (existingFile[msg.language]) return languages;
                var languageFile = cachePath + path.sep + 'messages.' + msg.language + '.po';
                if (fs.existsSync(languageFile)) {
                    poFiles.push(languageFile);
                    existingFile[msg.language] = true;
                    return languages;
                }
                if (!languages[msg.language]) languages[msg.language] = new PO();
                var item = new PO.Item();
                item.msgid = msg.msgid;
                item.msgstr = msg.msgstr;
                languages[msg.language].items.push(item);
                return languages;
            }, {});
            var languages = Object.keys(translations);
            if (!languages.length) {
                resolve(poFiles);
                return;
            }
            languages.map((language) => {
                var languageFile = cachePath + path.sep + 'messages.' + language + '.po';
                fs.writeFileSync(languageFile, translations[language].toString());
                poFiles.push(languageFile);
            });
            resolve(poFiles);
        });
    });
}

module.exports = function(source) {
    if (source.indexOf('<Text') === -1) {
        return source;
    }
    var callback = this.async();
    var loaderOptions = loaderUtils.parseQuery(this.query);
    getPoLocation(loaderOptions.path, this.options.closures.translate).then((poFiles) => {
        poFiles.map((poFile) => {
            var po = PO.parse(fs.readFileSync(poFile).toString());
            var translations = po.items.reduce((objects, translation) => {
                objects[translation.msgid] = true;
                return objects;
            }, {});
            var untranslated = translatable(source, translations);
            if (untranslated.length) {
                po = addToPo(untranslated, po, this.resourcePath);
                fs.writeFileSync(poFile, po.toString());
            }
        });
        callback(null, source);
    }).catch((e) => {
        callback(null, source);
    });
};

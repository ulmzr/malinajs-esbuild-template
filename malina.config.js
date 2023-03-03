const sassPlugin = require("malinajs/plugins/sass.js");

module.exports = function (option, filename) {
   option.css = false;
   option.passClass = false;
   option.immutable = true;
   option.plugins = [sassPlugin()];
   option.autoimport = (name) => `import ${name} from './${name}.xht';`;
   return option;
};

const sassPlugin = require("malinajs/plugins/sass.js");
const fs = require("node:fs");
const path = require("node:path");

const dirSearch = ["", "cmp/", "modules/"];
const iteration = 3;

module.exports = function (option, filename) {
   option.css = false;
   option.passClass = false;
   option.immutable = true;
   option.plugins = [sassPlugin()];
   option.autoimport = (name) => {
      filename = filename.replace(/\\/g, "/");
      const currdir = filename.substring(0, filename.lastIndexOf("/"));
      let result;
      let addPath = "";
      for (let i = 0; i < iteration; i++) {
         addPath = i > 0 ? addPath + "../" : addPath;
         dirSearch.map((dir) => {
            const fileSearch = addPath + dir + name;
            const dirSearch = addPath + dir + name.toLowerCase();
            const searchFile = path.join(currdir, fileSearch);
            const searchDir = path.join(currdir, dirSearch);
            if (fs.existsSync(searchFile + ".xht")) {
               result = `import ${name} from '${fileSearch}.xht';`;
            } else if (fs.existsSync(searchDir + "/+page.xht")) {
               result = `import ${name} from '${dirSearch}/+page.xht';`;
            }
            if (result) return;
         });
         if (result) break;
      }
      return result;
   };
   return option;
};

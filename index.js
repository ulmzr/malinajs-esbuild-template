const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const malina = require("malinajs");
const { WebSocketServer } = require("ws");
const chokidar = require("chokidar");
const esbuild = require("esbuild");
const { send } = require("node:process");

const cwd = process.cwd();
const esbuildConfigPath = path.join(cwd, "esbuild.config.js");
const esbuildConfig = fs.existsSync(esbuildConfigPath)
   ? require(esbuildConfigPath)
   : {};

const DEV = process.argv.includes("--dev") || false;

var port;
process.argv.filter((arg, index) => {
   port = process.argv[index + 1];
   return arg == "-p";
});

if (!parseInt(port)) port = 3000;

var publicDir;
process.argv.filter((arg, index) => {
   publicDir = process.argv[index + 1];
   return arg == "--serve";
});

if (!publicDir) publicDir = "public";

var ctx, socket;

const compile = async () => {
   try {
      // Compile & bundle script
      ctx = await esbuild.context({
         entryPoints: [`src/main.js`],
         minify: DEV ? false : true,
         bundle: true,
         outfile: "public/main.js",
         plugins: [malinaPlugin()],
         ...esbuildConfig,
      });

      await ctx.watch();
      if (!DEV) await ctx.dispose();
   } catch (error) {
      console.log(error);
   }
};

compile();

if (DEV) {
   const server = http
      .createServer((req, res) => {
         var source = "",
            fromUrl = "",
            url = req.url.replace(/[\#\?].*$/, ""),
            mime = mimeType(url);

         if (DEV && url.includes("/lrscript.js")) {
            res.setHeader("Content-Type", "text/javascript");
            res.write(injectedScript());
            res.end();
            return;
         }

         if (!mime) {
            fromUrl = url;
            url = "/index.html";
            mime = mimeType().default;
         }

         var filename = path.join(cwd, publicDir, url);
         var code = fs.existsSync(filename) ? "200" : 404;

         if (code === "200") source = fs.readFileSync(filename, "utf8");

         if (DEV && url.endsWith("index.html"))
            source = source.replace(
               "</head>",
               `<script src="/lrscript.js"></script></head>`
            );

         console.log(code, `☛`, url, fromUrl ? `☚ redirect ${fromUrl}` : ``);

         res.writeHead(code, { "Content-type": mime });
         res.end(source);
      })
      .listen(port, () => {
         console.log(`Run on http://localhost:${port}`);
      });

   // Start websocket
   new Promise((resolve, reject) => {
      new WebSocketServer({ port: 35729 }).on("connection", (ws) => {
         socket = ws;
         resolve();
      });
   });

   // Start watching
   var hot;

   const _src = chokidar.watch(["src"], {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      cwd: __dirname,
   });

   _src.on("change", async (path) => {
      if (!socket) return;
      hot = false;
      path = path.replace(/(\\\\|\\)/g, "/");
      if (path.match(/^.*\.(scss|css)$/)) {
         hot = true;
         await ctx.rebuild();
      }
   });

   const _public = chokidar.watch([publicDir], {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      cwd: __dirname,
   });

   _public.on("change", (path) => {
      if (!socket) return;
      path = path.replace(/(\\\\|\\)/g, "/");
      if (path.match(/^.*\.(scss|css)$/)) hot = true;
      else hot = false;
      socket.send(
         JSON.stringify({
            hot,
            change: path.replace(publicDir, ""),
         })
      );
      !hot && console.log("\nLive reload...!\n");
   });
}

const readFile = (filename, encoding) => {
   return new Promise((resolve, reject) => {
      resolve(fs.readFileSync(filename, encoding));
   });
};

function malinaPlugin(options = {}) {
   if (options.displayVersion !== false)
      console.log("MalinaJS ", malina.version);
   const cssModules = new Map();
   return {
      name: "malina-plugin",
      setup(build) {
         build.onLoad({ filter: /\.(xht|ma)$/ }, async (args) => {
            try {
               let source = await readFile(args.path, "utf8");
               let ctx = await malina.compile(source, {
                  path: args.path,
                  name: args.path.match(/([^/\\]+)\.\w+$/)[1],
                  ...options,
               });

               let code = ctx.result;

               if (ctx.css.result) {
                  const cssPath = args.path
                     .replace(/\.\w+$/, ".malina.css")
                     .replace(/\\/g, "/");
                  cssModules.set(cssPath, ctx.css.result);
                  code += `\nimport "${cssPath}";`;
               }
               return { contents: code };
            } catch (error) {
               console.log(error);
               return {};
            }
         });

         build.onResolve({ filter: /\.malina\.css$/ }, ({ path }) => {
            return { path, namespace: "malinacss" };
         });

         build.onLoad(
            { filter: /\.malina\.css$/, namespace: "malinacss" },
            ({ path }) => {
               const css = cssModules.get(path);
               return css ? { contents: css, loader: "css" } : null;
            }
         );
      },
   };
}

function mimeType(uri) {
   const map = {
      default: "text/html, charset=UTF-8",
      ".ico": "image/x-icon",
      ".html": "text/html, charset=UTF-8",
      ".js": "text/javascript",
      ".json": "application/json",
      ".css": "text/css",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".webp": "image/webp",
      ".wav": "audio/wav",
      ".mp3": "audio/mpeg",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".doc": "application/msword",
   };
   if (uri) return map[uri.match(/\.([0-9a-z]+)(?=[?#])|(\.)(?:[\w]+)$/gim)];
   else return map;
}

function injectedScript() {
   return `
const url = "ws://localhost:35729"
var s = new WebSocket(url)
s.onclose =_=> {
   const run =_=> {
      s = new WebSocket(url)
      s.onerror =_=> setTimeout(run, 2000)
      s.onopen =_=> location.reload()
   };
   run()
}
s.onmessage = e => {
   const updated = JSON.parse(e.data)
   if(!updated.hot)location.reload()
   const link = document.querySelector('link[href*="' + updated.change + '"]')
   if(!link) return 
   const url = new URL(link.href)
   const next = link.cloneNode()
   next.onload =_=> link.remove()
   next.href = url.pathname + "?" + Math.random().toString(16).substr(-6)
   link.parentNode.insertBefore(next, link.nextSibling)
}`;
}

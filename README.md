[![Node.js version](https://img.shields.io/badge/node-%3E%3D11.7.0-blue)](https://nodejs.org)
[![Bit.dev package](https://img.shields.io/badge/%20bit%20-programingjd.node%2Fhandlers%2Fstatic-blueviolet)](https://bit.dev/programingjd/node/handlers/static)
[![GitHub package.json version](https://img.shields.io/github/package-json/v/programingjd/bit.node.handlers.static)](https://bit.dev/programingjd/node/handlers/static)
[![GitHub](https://img.shields.io/github/license/programingjd/bit.node.handlers.static)](LICENSE)
![Travis (.org)](https://img.shields.io/travis/programingjd/bit.node.handlers.static)
![Coveralls github](https://img.shields.io/coveralls/github/programingjd/bit.node.handlers.static)

Node.js module.

Http handler for serving static files.

All files of supported types are processed and loaded in memory.

ETag are computed for relevant file types.

Compressed versions (gzip and brotli) are stored for relevant file types.

There's a special endpoint to trigger a synchronization event and re-read the files from disk.


## Usage

```javascript
const http = require('http');
const staticDirectory = require('@bit/programingjd.node.handlers.static');

(async()=>{
  const handler = await staticDirectory({root: 'www'});
  http.createServer((request, response)=>{
    const accepted = handler.accept(request, response, 'not_used', request.connection.remoteAddress);
    if (accepted) {
      handler.handle(accepted);
    } else {
      response.writeHead(404);
      response.end();
    }
  }).listen(80); 
})();
```

## Options

- `root`  (string)

  The path of the directory to serve.
  
  It defaults to `'www'`.
  
- `prefix`  (string)

  The path prefix to use for serving the files.
  
  It defaults to `''` (no prefix).
  
  Example:
  
  `root = 'www'` and `prefix = 'files'`
  
  `/files/doc.html` on the server points to `./www/doc.html` on disk.
  
- `disallowSharedCache`  (boolean)

  If you require authorization to access these static files, you can prevent browsers
  from storing the cached data in a shared cache  by setting this option to `true`.
  
  It defaults to `false` (caching in a shared cache is allowed).

- `allowedFileTypes`  (object)

  You can override the default list of supported file types and provide your own.
  
  It defaults to the built-in file type list (see below for details).
  
  Example:
  
  ``` json
  {
    "html": {
      "headers": {
        "Content-Type": "text/html",
        "Cache-Control": "public,no-cache" 
      },
      "compress": true
    },
    "css": {
      "headers": {
        "Content-Type": "text/css",
        "Cache-Control": "public,no-cache" 
      },
      "compress": true
    },
    "js": {
      "headers": {
        "Content-Type": "application/javascript",
        "Cache-Control": "public,no-cache" 
      },
      "compress": true
    }
  }
  ```

  Note that for the headers, you need to provide at least `Content-Type` and `Cache-Control`.
  For `Cache-Control`, you have to provide the `public` directive even if it is the default,
  so that it can be replaced with `private` automatically when the `disallowSharedCache` is set.
  
  Setting `compress` to true triggers the automatic gzip and brotli compression.
  
  
## Default file types

  File extensions

  - .js (javascript file)
  - .mjs (javascript module)
  - .css (css file)
  - .map (css or javascript map file)
  - .htm and .html (html file)
  - .txt (text file)
  - .csv (csv file)
  - .md  (markdown file)
  - .adoc (asciidoc file)
  - .xml (xml file)
  - .gpx (gpx file)
  - .json (json file)
  - .jsonld (json-ld file)
  - .geojson (geojson file)
  - .topojson (topojson file)
  - .yml and .yaml (yaml file)
  - .woff (woff font file)
  - .woff2 (woff2 font file)
  - .jpg (jpeg image)
  - .png (png image)
  - .svg (svg image)
  - .ico (icon image)
  - .webp (webp image)
  - .mp4 (mp4 video)
  - .webm (webm video)
  - .zip (zip archive)
  - .epub (epub ebook)
  - .pdf (pdf document)
  - .wav (wav audio)
  - .mp3 (mp3 audio)
  - .aac (aac audio)
  - .wasm (wasm binary file)
  - .wat (wasm text file)
  - .sig (pgp signature file)
  - .bin (binary file)
  - .glsl (glsl shader)
  - .gltf (gltf model)
  - .glb (gltf binary model)
  - .manifest (web manifest)

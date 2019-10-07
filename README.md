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
    const accepted = handler.accept(request, response);
    if (accepted) {
      handler.handle(accepted);
    } else {
      response.writeHead(404);
      response.end();
    }
  }).listen(80); 
})();
```


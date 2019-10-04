const assert= require('assert');
const http = require('http');
const zlib=require('zlib');
const staticHandler = require('../static');

const port = 8080;

const gz=async compressed=>{
  return new Promise((resolve)=>{
    zlib.gunzip(compressed,(err,uncompressed)=>resolve(uncompressed))
  });
};

const br=async compressed=>{
  return new Promise((resolve)=>{
    zlib.brotliDecompress(compressed, (err,uncompressed)=>resolve(uncompressed))
  });
};

const request=(path,method='get',extraHeaders={})=>new Promise((resolve,reject)=>{
  const request=http.request({
    host: 'localhost',
    port: port,
    path: path,
    headers: extraHeaders,
    method: method.toUpperCase()
  });
  const data=[];
  let status = 0;
  let headers = new Map();
  let error = undefined;
  request.on('error', e=>error=e);
  request.on('response', it=>{
    status = it.statusCode;
    Object.keys(it.headers).forEach(h=>{
      headers.set(h,it.headers[h]);
    });
    it.on('data', it=>data.push(it));
  });
  request.on('close', ()=>{
    if (error) reject(error);
    resolve(
      {
        status: status,
        headers: headers,
        body: Buffer.concat(data)
      }
    );
  });
  request.setTimeout(3000).end();
});

let server;

before(async()=>{
  const handler1 = await staticHandler('test/data');
  const handler2 = await staticHandler('test/data', '/other', true);
  server = http.createServer((request, response)=>{
    for(const handler of [handler1,handler2]){
      const accepted = handler.accept(request, response);
      if (accepted) return handler.handle(accepted);
    }
    response.writeHead(404).end();
  });
  server.listen(port);
});

after(()=>{
  server.close();
});

describe('Status Codes', ()=>{
  describe('404 Not Found', ()=>{
    it('HEAD request to non existing html file', async()=>{
      const response = await request('/non_existing.html', 'head');
      assert.strictEqual(response.status, 404);
    });
    it('GET request to non existing html file', async()=>{
      const response = await request('/non_existing.html', 'get');
      assert.strictEqual(response.status, 404);
    });
    it('HEAD request to non existing html file in a sub directory', async()=>{
      const response = await request('/dir1/not_there.html', 'head');
      assert.strictEqual(response.status, 404);
    });
    it('HEAD request to non existing json file in a sub directory', async()=>{
      const response = await request('/dir1/data.json', 'head');
      assert.strictEqual(response.status, 404);
    });
    it('HEAD request to an existing index file', async()=>{
      const response = await request('/index.html', 'head');
      assert.strictEqual(response.status, 404);
    });
    it('GET request to an existing index file in a sub directory', async()=>{
      const response = await request('/dir1/index.html', 'get');
      assert.strictEqual(response.status, 404);
    });
    it('HEAD request to an existing file with unsupported type', async()=>{
      const response = await request('/file.unknown', 'head');
      assert.strictEqual(response.status, 404);
    });
    it('GET request to an existing file with unsupported type in a sub directory', async()=>{
      const response = await request('/dir2/not.served', 'get');
      assert.strictEqual(response.status, 404);
    });
    it('HEAD request to a hidden json file', async()=>{
      const response = await request('/.hidden.json', 'head');
      assert.strictEqual(response.status, 404);
    });
    it('GET request to a hidden text file in a sub directory', async()=>{
      const response = await request('/dir2/.hidden.txt', 'get');
      assert.strictEqual(response.status, 404);
    });
    it('HEAD request to a hidden directory with an existing index file', async()=>{
      const response = await request('/.hiddendir/', 'head');
      assert.strictEqual(response.status, 404);
    });
    it('GET request to an existing text field in a hidden directory', async()=>{
      const response = await request('/.hiddendir/data.txt', 'get');
      assert.strictEqual(response.status, 404);
    });
  });
  describe('200 OK', ()=>{
    it('HEAD request to an existing image file', async()=>{
      const response = await request('/1px.jpg', 'head');
      assert.strictEqual(response.status, 200);
    });
    it('GET request to an existing json file in a sub directory', async()=>{
      const response = await request('/dir2/data.json', 'head');
      assert.strictEqual(response.status, 200);
    });
    it('HEAD request to the root directory with an existing index file', async()=>{
      const response = await request('/', 'head');
      assert.strictEqual(response.status, 200);
    });
    it('GET request to a sub directory with an existing index file', async()=>{
      const response = await request('/dir1/dir3/', 'head');
      assert.strictEqual(response.status, 200);
    });
  });
  describe('301 Moved Permanently',()=>{
    it('HEAD request to a directory with an index without the trailing slash', async()=>{
      const response = await request('/dir1', 'head');
      assert.strictEqual(response.status, 301);
      assert.strictEqual(response.headers.get('location'), '/dir1/');
    });
    it('GET request to a sub directory with an index without the trailing slash', async()=>{
      const response = await request('/dir1/dir3', 'get');
      assert.strictEqual(response.status, 301);
      assert.strictEqual(response.headers.get('location'), '/dir1/dir3/');
    });
  });
  describe('304 Not Modified', ()=>{
    it('HEAD request to an image file', async()=>{
      const etag = '+X9YZcJ547YGJ7jhunUrmRXjhy3ygUrrIhckuNIy1mY';
      const response = await request('/1px.jpg', 'head', { 'If-None-Match': etag });
      assert.strictEqual(response.headers.get('etag'), etag);
      assert.strictEqual(response.status, 304);
    });
    it('GET request to a directory index file', async()=>{
      const etag = '9VY0i3gpHKQsFLVJVjK9HOMnWhFHOd+F31ArxHssWNw';
      const response = await request('/dir1/dir3/', 'head', { 'If-None-Match': etag });
      assert.strictEqual(response.headers.get('etag'), etag);
      assert.strictEqual(response.status, 304);
    });
    it('HEAD request to a javascript file', async()=>{
      const etag = 'bBXtwZqz5iyXqKK1XZsZbAyuMEkl8HiofD-GhqEcJk4';
      const response = await request('/other/dir1/script.js', 'head', { 'If-None-Match': etag });
      assert.strictEqual(response.headers.get('etag'), etag);
      assert.strictEqual(response.status, 304);
    });
  });
});

describe('Cache-Control',()=>{
  describe('Resources with potential frequent modifications',()=>{
    it('HEAD request to a javascript file', async()=>{
      const response = await request('/dir1/script.js', 'head');
      const cacheControls = response.headers.get('cache-control').split(',');
      assert.strictEqual(cacheControls.find(it=>it==='public'), 'public');
      assert.strictEqual(cacheControls.find(it=>it==='no-cache'), 'no-cache');
      assert.strictEqual([...response.headers.keys()].find(it=>it==='etag'), 'etag');
    });
    it('GET request to a javascript module file', async()=>{
      const response = await request('/dir1/module.mjs', 'get');
      const cacheControls = response.headers.get('cache-control').split(',');
      assert.strictEqual(cacheControls.find(it=>it==='public'), 'public');
      assert.strictEqual(cacheControls.find(it=>it==='no-cache'), 'no-cache');
      assert.strictEqual([...response.headers.keys()].find(it=>it==='etag'), 'etag');
    });
    it('HEAD request to a css file', async()=>{
      const response = await request('/dir1/a.css', 'head');
      const cacheControls = response.headers.get('cache-control').split(',');
      assert.strictEqual(cacheControls.find(it=>it==='public'), 'public');
      assert.strictEqual(cacheControls.find(it=>it==='no-cache'), 'no-cache');
      assert.strictEqual([...response.headers.keys()].find(it=>it==='etag'), 'etag');
    });
    it('GET request to an html file', async()=>{
      const response = await request('/dir1/a.html', 'get');
      const cacheControls = response.headers.get('cache-control').split(',');
      assert.strictEqual(cacheControls.find(it=>it==='public'), 'public');
      assert.strictEqual(cacheControls.find(it=>it==='no-cache'), 'no-cache');
      assert.strictEqual([...response.headers.keys()].find(it=>it==='etag'), 'etag');
    });
  });
  describe('Resources with infrequent modifications',()=>{
    it('HEAD request to text file', async()=>{
      const response = await request('/dir2/info.txt', 'head');
      const cacheControls = response.headers.get('cache-control').split(',');
      assert.strictEqual(cacheControls.find(it=>it==='public'), 'public');
      assert.strictEqual(cacheControls.find(it=>it==='must-revalidate'), 'must-revalidate');
      assert.strictEqual(cacheControls.find(it=>it==='max-age=86400'), 'max-age=86400');
      assert.strictEqual([...response.headers.keys()].find(it=>it==='etag'), 'etag');
    });
    it('GET request to a json file', async()=>{
      const response = await request('/dir2/data.json', 'get');
      const cacheControls = response.headers.get('cache-control').split(',');
      assert.strictEqual(cacheControls.find(it=>it==='public'), 'public');
      assert.strictEqual(cacheControls.find(it=>it==='must-revalidate'), 'must-revalidate');
      assert.strictEqual(cacheControls.find(it=>it==='max-age=3600'), 'max-age=3600');
      assert.strictEqual([...response.headers.keys()].find(it=>it==='etag'), 'etag');
    });
  });
  describe('Immutable resources',()=>{
    it('HEAD request to an image file', async()=>{
      const response = await request('/1px.jpg', 'head');
      const cacheControls = response.headers.get('cache-control').split(',');
      assert.strictEqual(cacheControls.find(it=>it==='public'), 'public');
      assert.strictEqual(cacheControls.find(it=>it==='immutable'), 'immutable');
      assert.strictEqual([...response.headers.keys()].find(it=>it==='etag'), 'etag');
    });
    it('GET request to an image file', async()=>{
      const response = await request('/1px.png', 'get');
      const cacheControls = response.headers.get('cache-control').split(',');
      assert.strictEqual(cacheControls.find(it=>it==='public'), 'public');
      assert.strictEqual(cacheControls.find(it=>it==='immutable'), 'immutable');
      assert.strictEqual([...response.headers.keys()].find(it=>it==='etag'), 'etag');
    });
  });
  describe('Disallowed shared cache', ()=>{
    it('HEAD request to an imagefile', async()=>{
      const response = await request('/other/1px.png', 'head');
      const cacheControls = response.headers.get('cache-control').split(',');
      assert.strictEqual(cacheControls.find(it=>it==='private'), 'private');
      assert.strictEqual(cacheControls.find(it=>it==='immutable'), 'immutable');
      assert.strictEqual([...response.headers.keys()].find(it=>it==='etag'), 'etag');
    });
    it('GET request to a json file', async()=>{
      const response = await request('/other/dir2/data.json', 'get');
      const cacheControls = response.headers.get('cache-control').split(',');
      assert.strictEqual(cacheControls.find(it=>it==='private'), 'private');
      assert.strictEqual(cacheControls.find(it=>it==='must-revalidate'), 'must-revalidate');
      assert.strictEqual(cacheControls.find(it=>it==='max-age=3600'), 'max-age=3600');
      assert.strictEqual([...response.headers.keys()].find(it=>it==='etag'), 'etag');
    });
  });
});

describe('Content', ()=>{
  describe('Content-Type and Content-Length', ()=>{
    it('HEAD request to a text file', async()=>{
      const response = await request('/dir2/info.txt', 'head');
      assert.strictEqual(response.headers.get('content-type'), 'text/plain');
      assert.strictEqual(parseInt(response.headers.get('content-length')), 6);
    });
    it('GET request to a json file', async()=>{
      const response = await request('/other/data.json', 'get');
      assert.strictEqual(response.headers.get('content-type'), 'application/json');
      assert.strictEqual(parseInt(response.headers.get('content-length')), 15);
    });
    it('HEAD request to a directory index file', async()=>{
      const response = await request('/dir1/', 'head');
      assert.strictEqual(response.headers.get('content-type'), 'text/html');
      assert.strictEqual(parseInt(response.headers.get('content-length')), 131);
    });
  });
  describe('Compression', ()=>{
    describe('none', ()=>{
      it('HEAD request to a text file', async()=>{
        const response = await request('/dir2/info.txt', 'head', { 'Accept-Encoding': 'entity' });
        assert.strictEqual(response.headers.get('content-encoding'), undefined);
      });
      it('GET request to a json file', async()=>{
        const response = await request('/other/data.json', 'get', { 'Accept-Encoding': 'entity' });
        assert.strictEqual(response.headers.get('content-encoding'), undefined);
        assert.strictEqual(response.body.toString().trim(), '{"root":true}')
      });
      it('HEAD request to a directory index file', async()=>{
        const response = await request('/dir1/', 'head', { 'Accept-Encoding': 'entity' });
        assert.strictEqual(response.headers.get('content-encoding'), undefined);
      });
    });
    describe('gzip', ()=>{
      it('HEAD request to a text file', async()=>{
        const response = await request('/dir2/info.txt', 'head', { 'Accept-Encoding': 'gzip' });
        assert.strictEqual(response.headers.get('content-encoding'), 'gzip');
      });
      it('GET request to a json file', async()=>{
        const response = await request('/other/data.json', 'get', { 'Accept-Encoding': 'gzip' });
        assert.strictEqual(response.headers.get('content-encoding'), 'gzip');
        assert.strictEqual((await gz(response.body)).toString().trim(), '{"root":true}')
      });
      it('HEAD request to a directory index file', async()=>{
        const response = await request('/dir1/', 'head', { 'Accept-Encoding': 'gzip' });
        assert.strictEqual(response.headers.get('content-encoding'), 'gzip');
      });
      it('HEAD request to an image file', async()=>{
        const response = await request('/1px.jpg', 'head', { 'Accept-Encoding': 'gzip' });
        assert.strictEqual(response.headers.get('content-encoding'), undefined);
      });
    });
    describe('brotli', ()=>{
      it('HEAD request to a text file', async()=>{
        const response = await request('/dir2/info.txt', 'head', { 'Accept-Encoding': 'br' });
        assert.strictEqual(response.headers.get('content-encoding'), 'br');
      });
      it('GET request to a json file', async()=>{
        const response = await request('/other/data.json', 'get', { 'Accept-Encoding': 'br' });
        assert.strictEqual(response.headers.get('content-encoding'), 'br');
        assert.strictEqual((await br(response.body)).toString().trim(), '{"root":true}')
      });
      it('HEAD request to a directory index file', async()=>{
        const response = await request('/dir1/', 'head', { 'Accept-Encoding': 'br' });
        assert.strictEqual(response.headers.get('content-encoding'), 'br');
      });
      it('HEAD request to an image file', async()=>{
        const response = await request('/1px.jpg', 'head', { 'Accept-Encoding': 'br' });
        assert.strictEqual(response.headers.get('content-encoding'), undefined);
      });
    });
  });
});

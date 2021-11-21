const assert=require('assert');
const http=require('http');
const zlib=require('zlib');
const staticHandler=require('../static');

const port = 8080;

/**
 * Performs a gzip decompression.
 * @param {Buffer} compressed
 * @returns {Promise<Buffer>}
 */
const gz=async compressed=>{
  return new Promise((resolve)=>{
    zlib.gunzip(compressed,(err,uncompressed)=>resolve(uncompressed))
  });
};

/**
 * Performs a brotli decompression.
 * @param {Buffer} compressed
 * @returns {Promise<Buffer>}
 */
const br=async compressed=>{
  return new Promise((resolve)=>{
    zlib.brotliDecompress(compressed, (err,uncompressed)=>resolve(uncompressed))
  });
};

/**
 * Http methods.
 * @readonly
 * @enum {string}
 */
const Methods={
  head: 'head',
  get: 'get',
  delete: 'delete'
};

/**
 * @typedef {Object<string,*>} Response
 * @property {number} status
 * @property {Map<String,String>} headers
 * @property {Buffer} body
 */

/**
 * Performs an http request to the local server.
 * @param {string} path
 * @param {Methods=} method
 * @param {Object<string,string>?} extraHeaders
 * @returns {Promise<Response>}
 */
const request=(path,method=Methods.get,extraHeaders)=>new Promise((resolve,reject)=>{
  const options={
    host: 'localhost',
    port: port,
    path: path,
    method: method.toUpperCase()
  };
  if(extraHeaders) options.headers=extraHeaders;
  const request=http.request(options);
  const data=[];
  let status=0;
  let headers=new Map();
  let error=undefined;
  request.on('error', e=>error=e);
  request.on('response', it=>{
    status=it.statusCode;
    Object.keys(it.headers).forEach(h=>{
      headers.set(h,it.headers[h]);
    });
    it.on('data', it=>data.push(it));
  });
  request.on('close', ()=>{
    if (error) reject(error);
    else resolve(
      {
        status: status,
        headers: headers,
        body: Buffer.concat(data)
      }
    );
  });
  request.setTimeout(3000).end();
});

/**
 * Supported encodings.
 * @readonly
 * @enum {string}
 */
const Encodings={
  identity: 'identity',
  gzip: 'gzip',
  brotli: 'br'
};

let server;

before(async()=>{
  const handler1=await staticHandler({ root: 'test/data' });
  const handler2=await staticHandler({ root: 'test/data', prefix: '/other/', disallowSharedCache: true });
  const handler3=await staticHandler({
    root: 'test/data',
    prefix: '/custom',
    allowedFileTypes: {
      abc: {
        headers:{
          'Content-Type':'text/plain',
          'Cache-Control':'public,no-cache',
          'X-Custom':'custom'
        },
        compress:true
      }
    }
  });
  server=http.createServer((request, response)=>{
    for(const handler of [handler1,handler2,handler3]){
      const accepted=handler.accept(
        request, response,
        'localhost', typeof request.headers['x-non-local'] === 'string' ? '127.0.0.2' : '127.0.0.1',
      );
      if (accepted || request.url==='/test') return handler.handle(accepted);
    }
    response.writeHead(404);
    response.end();
  });
  server.listen(port);
});

after(()=>{
  server.close();
});

describe('Status Codes', ()=>{
  /**
   * @param {Response} response
   * @param {number} expectedStatusCode
   */
  const checkStatus=(response,expectedStatusCode)=>{
    assert.strictEqual(response.status,expectedStatusCode);
  };

  describe('404 Not Found', ()=>{
    const expectedStatusCode=404;
    it('HEAD request to non existing html file', async()=>{
      const response=await request('/non_existing.html', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('GET request to non existing html file', async()=>{
      const response=await request('/non_existing.html', Methods.get);
      checkStatus(response, expectedStatusCode);
    });
    it('HEAD request to non existing html file in a sub directory', async()=>{
      const response=await request('/dir1/not_there.html', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('HEAD request to non existing json file in a sub directory', async()=>{
      const response=await request('/dir1/data.json', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('HEAD request to an existing index file', async()=>{
      const response=await request('/index.html', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('GET request to an existing index file in a sub directory', async()=>{
      const response=await request('/dir1/index.html', Methods.get);
      checkStatus(response, expectedStatusCode);
    });
    it('HEAD request to an existing file with unsupported type', async()=>{
      const response=await request('/file.unknown', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('GET request to an existing file with unsupported type in a sub directory', async()=>{
      const response=await request('/dir2/not.served', Methods.get);
      checkStatus(response, expectedStatusCode);
    });
    it('HEAD request to a hidden json file', async()=>{
      const response=await request('/.hidden.json', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('GET request to a hidden text file in a sub directory', async()=>{
      const response=await request('/dir2/.hidden.txt', Methods.get);
      checkStatus(response, expectedStatusCode);
    });
    it('HEAD request to a hidden directory with an existing index file', async()=>{
      const response=await request('/.hiddendir/', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('GET request to an existing text field in a hidden directory', async()=>{
      const response=await request('/.hiddendir/data.txt', Methods.get);
      checkStatus(response, expectedStatusCode);
    });
  });
  describe('405 Method Not Allowed', ()=>{
    const expectedStatusCode=405;
    it('DELETE request to an existing image file', async()=>{
      const response=await request('/1px.jpg', Methods.delete);
      checkStatus(response, expectedStatusCode);
    });
  });
  describe('200 OK', ()=>{
    const expectedStatusCode=200;
    it('HEAD request to an existing image file', async()=>{
      const response=await request('/1px.jpg', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('GET request to an existing json file in a sub directory', async()=>{
      const response=await request('/dir2/data.json', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('HEAD request to the root directory with an existing index file', async()=>{
      const response=await request('/', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('GET request to a sub directory with an existing index file', async()=>{
      const response=await request('/dir1/dir3/', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('HEAD request to an existing image file with an uri query', async()=>{
      const response=await request('/1px.jpg?a=1', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('GET request to a sub directory with an existing index file with an uri fragment', async()=>{
      const response=await request('/dir1/dir3/#top', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
    it('GET request to an existing json file in a sub directory with an fragment and query', async()=>{
      const response=await request('/dir2/data.json?test=true#start', Methods.head);
      checkStatus(response, expectedStatusCode);
    });
  });
  describe('301 Moved Permanently',()=>{
    const expectedStatusCode=301;
    it('HEAD request to a directory with an index without the trailing slash', async()=>{
      const response=await request('/dir1', Methods.head);
      checkStatus(response, expectedStatusCode);
      assert.strictEqual(response.headers.get('location'), '/dir1/');
    });
    it('GET request to a sub directory with an index without the trailing slash', async()=>{
      const response=await request('/dir1/dir3', Methods.get);
      checkStatus(response, expectedStatusCode);
      assert.strictEqual(response.headers.get('location'), '/dir1/dir3/');
    });
  });
  describe('304 Not Modified', ()=>{
    const expectedStatusCode=304;
    /**
     * @param {Response} response
     * @param {string} expectedETag
     */
    const checkETag=(response,expectedETag)=>{
      assert.strictEqual(response.headers.get('etag'), expectedETag);
    };
    it('HEAD request to an image file', async()=>{
      const etag='+X9YZcJ547YGJ7jhunUrmRXjhy3ygUrrIhckuNIy1mY';
      const response=await request('/1px.jpg', Methods.head, { 'if-none-match': etag });
      checkETag(response, etag);
      checkStatus(response, expectedStatusCode);
    });
    it('GET request to a directory index file', async()=>{
      const etag='+mVoTaHNjZDSLTD3Ea4xva9BSDMmAMD5uxS-ZXtGhuQ';
      const response=await request('/dir1/dir3/', Methods.head, { 'if-none-match': etag });
      checkETag(response, etag);
      checkStatus(response, expectedStatusCode);
    });
    it('HEAD request to a javascript file', async()=>{
      const etag='UaJyO4VLYBzsVKv4mTmX4hzIusgqyWgRaYA--nkxjI8';
      const response=await request('/other/dir1/script.js', Methods.head, { 'if-none-match': etag });
      checkETag(response, etag);
      checkStatus(response, expectedStatusCode);
    });
  });
});

describe('Cache-Control',()=>{
  /**
   * @param {Response} response
   * @param {...string} expectedDirectives
   */
  const checkCacheControl=(response, ...expectedDirectives)=>{
    const cacheControls=response.headers.get('cache-control').split(',');
    for (const directive of expectedDirectives) {
      assert.strictEqual(cacheControls.find(it=>it===directive), directive);
    }
  };
  /**
   * @param {Response} response
   */
  const checkETag=response=>{
    assert.strictEqual([...response.headers.keys()].find(it=>it==='etag'), 'etag');
  };
  describe('Resources with potential frequent modifications',()=>{
    it('HEAD request to a javascript file', async()=>{
      const response=await request('/dir1/script.js', Methods.head);
      checkCacheControl(response,'public', 'no-cache');
      checkETag(response);
    });
    it('GET request to a javascript module file', async()=>{
      const response=await request('/dir1/module.mjs', Methods.get);
      checkCacheControl(response,'public', 'no-cache');
      checkETag(response);
    });
    it('HEAD request to a css file', async()=>{
      const response=await request('/dir1/a.css', Methods.head);
      checkCacheControl(response,'public', 'no-cache');
      checkETag(response);
    });
    it('GET request to an html file', async()=>{
      const response=await request('/dir1/a.html', Methods.get);
      checkCacheControl(response,'public', 'no-cache');
      checkETag(response);
    });
  });
  describe('Resources with infrequent modifications',()=>{
    it('HEAD request to text file', async()=>{
      const response = await request('/dir2/info.txt', Methods.head);
      checkCacheControl(response,'public', 'must-revalidate', 'max-age=86400');
      checkETag(response);
    });
    it('GET request to a json file', async()=>{
      const response=await request('/dir2/data.json', Methods.get);
      checkCacheControl(response,'public', 'must-revalidate', 'max-age=3600');
      checkETag(response);
    });
  });
  describe('Immutable resources',()=>{
    it('HEAD request to an image file', async()=>{
      const response=await request('/1px.jpg', Methods.head);
      checkCacheControl(response,'public', 'immutable');
      checkETag(response);
    });
    it('GET request to an image file', async()=>{
      const response=await request('/1px.png', Methods.get);
      checkCacheControl(response,'public', 'immutable');
      checkETag(response);
    });
  });
  describe('Disallowed shared cache', ()=>{
    it('HEAD request to an imagefile', async()=>{
      const response = await request('/other/1px.png', Methods.head);
      checkCacheControl(response,'private', 'immutable');
      checkETag(response);
    });
    it('GET request to a json file', async()=>{
      const response=await request('/other/dir2/data.json', Methods.get);
      checkCacheControl(response,'private', 'must-revalidate', 'max-age=3600');
      checkETag(response);
    });
  });
});

describe('Content', ()=>{
  describe('Content-Type and Content-Length', ()=>{
    /**
     * @param {Response} response
     * @param {string} expectedContentType
     */
    const checkContentType=(response, expectedContentType)=>{
      assert.strictEqual(response.headers.get('content-type'), expectedContentType);
    };
    /**
     * @param {Response} response
     * @param {number} expectedContentLength
     */
    const checkContentLength=(response, expectedContentLength)=>{
      assert.strictEqual(parseInt(response.headers.get('content-length')), expectedContentLength);
    };
    it('HEAD request to a text file', async()=>{
      const response=await request('/dir2/info.txt', Methods.head);
      checkContentType(response, 'text/plain');
      checkContentLength(response, 5);
    });
    it('GET request to a json file', async()=>{
      const response=await request('/other/data.json', Methods.get);
      checkContentType(response, 'application/json');
      checkContentLength(response, 14);
    });
    it('HEAD request to a directory index file', async()=>{
      const response=await request('/dir1/', Methods.head);
      checkContentType(response, 'text/html');
      checkContentLength(response, 121);
    });
  });
  describe('Compression', ()=>{
    /**
     * @param {Response} response
     * @param {Encodings} expectedEncoding
     */
    const checkContentEncoding=(response, expectedEncoding)=>{
      assert.strictEqual(response.headers.get('content-encoding'), expectedEncoding === Encodings.identity ? undefined : expectedEncoding);
    };
    describe('none', ()=>{
      it('HEAD request to a text file', async()=>{
        const response=await request('/dir2/info.txt', Methods.head, { 'Accept-Encoding': Encodings.identity });
        checkContentEncoding(response, Encodings.identity);
      });
      it('GET request to a json file', async()=>{
        const response=await request('/other/data.json', Methods.get, { 'Accept-Encoding': Encodings.identity });
        checkContentEncoding(response, Encodings.identity);
        assert.strictEqual(response.body.toString().trim(), '{"root":true}')
      });
      it('HEAD request to a directory index file', async()=>{
        const response=await request('/dir1/', Methods.head, { 'Accept-Encoding': Encodings.identity });
        checkContentEncoding(response, Encodings.identity);
      });
      it('HEAD request to an image file', async()=>{
        const response=await request('/1px.jpg', Methods.head, { 'Accept-Encoding': Encodings.gzip });
        checkContentEncoding(response, Encodings.identity);
      });
      it('HEAD request to an image file', async()=>{
        const response=await request('/1px.jpg', Methods.head, { 'Accept-Encoding': Encodings.brotli });
        checkContentEncoding(response, Encodings.identity);
      });
    });
    describe('gzip', ()=>{
      it('HEAD request to a text file', async()=>{
        const response=await request('/dir2/info.txt', Methods.head, { 'Accept-Encoding': Encodings.gzip });
        checkContentEncoding(response, Encodings.gzip);
      });
      it('GET request to a json file', async()=>{
        const response=await request('/other/data.json', Methods.get, { 'Accept-Encoding': Encodings.gzip });
        checkContentEncoding(response, Encodings.gzip);
        assert.strictEqual((await gz(response.body)).toString().trim(), '{"root":true}')
      });
      it('HEAD request to a directory index file', async()=>{
        const response=await request('/dir1/', Methods.head, { 'Accept-Encoding': Encodings.gzip });
        checkContentEncoding(response, Encodings.gzip);
      });
    });
    describe('brotli', ()=>{
      it('HEAD request to a text file', async()=>{
        const response=await request('/dir2/info.txt', Methods.head, { 'Accept-Encoding': Encodings.brotli });
        checkContentEncoding(response, Encodings.brotli);
      });
      it('GET request to a json file', async()=>{
        const response=await request('/other/data.json', Methods.get, { 'Accept-Encoding': Encodings.brotli });
        checkContentEncoding(response, Encodings.brotli);
        assert.strictEqual((await br(response.body)).toString().trim(), '{"root":true}')
      });
      it('HEAD request to a directory index file', async()=>{
        const response=await request('/dir1/', Methods.head, { 'Accept-Encoding': Encodings.brotli });
        checkContentEncoding(response, Encodings.brotli);
      });
      it('GET request to a json file with unrestricted encoding', async()=>{
        const response=await request('/other/data.json', Methods.get, { 'Accept-Encoding': '*' });
        checkContentEncoding(response, Encodings.brotli);
        assert.strictEqual((await br(response.body)).toString().trim(), '{"root":true}')
      });
    });
  });
});

describe('Custom file type', ()=>{
  describe('".abc" file type', ()=>{
    it('GET request to an abc file', async()=>{
      const response=await request('/custom/custom.abc', Methods.get, { 'Accept-Encoding': Encodings.brotli });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('content-type'), 'text/plain');
      assert.strictEqual(response.headers.get('cache-control'), 'public,no-cache');
      assert.strictEqual(response.headers.get('x-custom'), 'custom');
      assert.strictEqual(response.headers.get('content-encoding'), Encodings.brotli);
      assert.strictEqual((await br(response.body)).toString().trim(), 'abc')

    });
  });
});

describe('Synchronization endpoint', ()=>{
  describe('Status code', ()=>{
    it('GET request to /sync', async()=>{
      const response=await request('/sync', Methods.get);
      assert.strictEqual(response.status, 200);
    });
    it('GET request to /other/sync', async()=>{
      const response=await request('/other/sync', Methods.get);
      assert.strictEqual(response.status, 200);
    });
    it('GET request to /custom/sync', async()=>{
      const response=await request('/custom/sync', Methods.get);
      assert.strictEqual(response.status, 200);
    });
    it('GET request to /invalid_prefix/sync', async()=>{
      const response=await request('/invalid_prefix/sync', Methods.get);
      assert.strictEqual(response.status, 404);
    });
  });
  describe('Simulated request to /sync from non local ip', ()=>{
    it('accept to /sync with local=false', async()=>{
      const response=await request('/sync', Methods.get, { 'X-Non-Local': 'true' });
      assert.strictEqual(response.status, 404);
    });
  });
});

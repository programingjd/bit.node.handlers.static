const assert = require('assert');
const http = require('http');
const staticHandler = require('./static');

const request=(path,method='get')=>new Promise((resolve,reject)=>{
  const request=http.request({
    host: 'localhost',
    port: 8080,
    path: path,
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

(async()=>{
  const handler = await staticHandler('testdata');
  const server = http.createServer((request, response)=>{
    const accepted = handler.accept(request, response);
    return accepted ? handler.handle(accepted) : response.writeHead(404).end();
  }).listen(8080);
  try{
    const r1 = await request('/a.json','head');
    assert.strictEqual(200, r1.status);
    assert.strictEqual('application/json', r1.headers.get('content-type'));
    assert.strictEqual('{"a":true}\r\n'.length, parseInt(r1.headers.get('content-length')));
    assert.strictEqual('', r1.body.toString());
    const r2 = await request('/a.json');
    assert.strictEqual(200,r2.status);
    assert.strictEqual('application/json', r2.headers.get('content-type'));
    assert.strictEqual('{"a":true}\r\n'.length, parseInt(r2.headers.get('content-length')));
    assert.strictEqual('{"a":true}\r\n',r2.body.toString());
    const r3 = await request('/b.json');
    assert.strictEqual(404, r3.status);
    const r4 = await request('/index.html');
    assert.strictEqual(404, r4.status);
    const r5 = await request('/');
    assert.strictEqual(200, r5.status);
    assert.strictEqual('text/html', r5.headers.get('content-type'));
  }
  finally{
    server.close();
  }
})();

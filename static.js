const fs=require('fs').promises;
const zlib=require('zlib');
const crypto=require('crypto');

const types={
  js: { headers: {'Content-Type':'application/javascript','Cache-Control':'public,no-cache'}, compress: true },
  mjs: { headers: {'Content-Type':'application/javascript','Cache-Control':'public,no-cache'}, compress: true },
  css: { headers: {'Content-Type':'text/css','Cache-Control':'public,no-cache'}, compress: true },
  map: { headers: {'Content-Type':'application/json','Cache-Control':'public,no-cache'}, compress: true },
  htm: { headers: {'Content-Type':'text/html','Cache-Control':'public,no-cache'}, compress: true },
  html: { headers: {'Content-Type':'text/html','Cache-Control':'public,no-cache'}, compress: true },
  txt: { headers: {'Content-Type':'text/plain','Cache-Control':'public,max-age=86400,must-revalidate'}, compress: true },
  csv: { headers: {'Content-Type':'text/csv','Cache-Control':'public,max-age=86400,must-revalidate'}, compress: true },
  md: { headers: {'Content-Type':'text/markdown','Cache-Control':'public,max-age=86400,must-revalidate'}, compress: true },
  adoc: { headers: {'Content-Type':'text/asciidoc','Cache-Control':'public,max-age=86400,must-revalidate'}, compress: true },
  xml: { headers: {'Content-Type':'application/xml','Cache-Control':'public,max-age=86400,must-revalidate'}, compress: true },
  gpx: { headers: {'Content-Type':'application/gpx+xml','Cache-Control':'public,max-age=86400,must-revalidate'}, compress: true },
  json: { headers: {'Content-Type':'application/json','Cache-Control':'public,max-age=3600,must-revalidate'}, compress: true },
  jsonld: { headers: {'Content-Type':'application/ld+json','Cache-Control':'public,max-age=3600,must-revalidate'}, compress: true },
  geojson: { headers: {'Content-Type':'application/geo+json','Cache-Control':'public,max-age=86400,must-revalidate'}, compress: true },
  topojson: { headers: {'Content-Type':'application/json','Cache-Control':'public,max-age=86400,must-revalidate'}, compress: true },
  yaml: { headers: {'Content-Type':'text/yaml','Cache-Control':'public,max-age=3600,must-revalidate'}, compress: true },
  woff: { headers: {'Content-Type':'application/font-woff','Cache-Control':'public,immutable'}, compress: false },
  woff2: { headers: {'Content-Type':'font/woff2','Cache-Control':'public,immutable'}, compress: false },
  jpg: { headers: {'Content-Type':'image/jpeg','Cache-Control':'public,immutable'}, compress: false },
  png: { headers: {'Content-Type':'image/png','Cache-Control':'public,immutable'}, compress: false },
  svg: { headers: {'Content-Type':'image/svg+xml','Cache-Control':'public,immutable'}, compress: true },
  ico: { headers: {'Content-Type':'image/x-icon','Cache-Control':'public,immutable'}, compress: false },
  webp: { headers: {'Content-Type':'image/webp','Cache-Control':'public,immutable'}, compress: false },
  mp4: { headers: {'Content-Type':'video/mp4','Cache-Control':'public,immutable'}, compress: false },
  webm: { headers: {'Content-Type':'video/webm','Cache-Control':'public,immutable'}, compress: false },
  zip: { headers: {'Content-Type':'application/zip','Cache-Control':'public,no-cache'}, compress: false },
  epub: { headers: {'Content-Type':'application/epub+zip','Cache-Control':'public,no-cache'}, compress: false },
  pdf: { headers: {'Content-Type':'application/pdf','Cache-Control':'public,no-cache'}, compress: true },
  wav: { headers: {'Content-Type':'audio/x-wav','Cache-Control':'public,immutable'}, compress: true },
  mp3: { headers: {'Content-Type':'audio/mp3','Cache-Control':'public,immutable'}, compress: false },
  aac: { headers: {'Content-Type':'audio/aac','Cache-Control':'public,immutable'}, compress: false },
  wasm: { headers: {'Content-Type':'application/wasm','Cache-Control':'public,max-age=3600,must-revalidate'}, compress: true },
  wat: { headers: {'Content-Type':'text/plain','Cache-Control':'public,max-age=3600,must-revalidate'}, compress: true },
  sig: { headers: {'Content-Type':'application/pgp-signature','Cache-Control':'public,no-cache'}, compress: false },
  bin: { headers: {'Content-Type':'application/octet-stream','Cache-Control':'public,max-age=86400,must-revalidate'}, compress: true},
  glsl: { headers: {'Content-Type':'text/plain','Cache-Control':'public,max-age=3600,must-revalidate'}, compress: true},
  gltf: { headers: {'Content-Type':'model/gltf+json','Cache-Control':'public,max-age=86400,must-revalidate'}, compress: true},
  glb: { headers: {'Content-Type':'model/gltf-binary','Cache-Control':'public,max-age=86400,must-revalidate'}, compress: true},
  manifest: { headers: {'Content-Type':'application/manifest+json','Cache-Control':'public,max-age=3600,must-revalidate'}, compress: true },
};

const gz=async uncompressed=>{
  return new Promise((resolve)=>{
    const options = { level: 9 };
    zlib.gzip(uncompressed, options,(err,compressed)=>resolve(compressed))
  });
};

const br=async (uncompressed,isText)=>{
  return new Promise((resolve)=>{
    const mode=isText?zlib.constants.BROTLI_MODE_TEXT:zlib.constants.BROTLI_MODE_GENERIC;
    const options = {
      params: {
        [ zlib.constants.BROTLI_PARAM_MODE ]: mode,
        [ zlib.constants.BROTLI_PARAM_QUALITY ]: zlib.constants.BROTLI_MAX_QUALITY,
        [ zlib.constants.BROTLI_PARAM_SIZE_HINT ]: uncompressed.length
      }
    };
    zlib.brotliCompress(uncompressed, options, (err,compressed)=>resolve(compressed))
  });
};

const etag=data=>{
  const hash=crypto.createHash('sha256').update(data).digest('base64');
  return hash.replace(/[/]/g,'-').replace(/[=]/g,'');
};

const bestSupportedEncoding=headers=>{
  const acceptEncodingHeader=(headers['accept-encoding']||'').trim();
  if(!acceptEncodingHeader) return null;
  if(acceptEncodingHeader==='*') return 'br';
  const list=acceptEncodingHeader.split(',').map(it=>it.replace(/;.*$/g,'').trim());
  if(list.indexOf('br')!==-1) return 'br';
  if(list.indexOf('gzip')!==-1) return 'gzip';
  return null;
};

const uriPath=uri=>{
  const i1=uri.indexOf('?');
  const i2=uri.indexOf('#');
  if(i1===-1){
    if(i2===-1) return uri;
    return uri.substring(0,i2);
  }
  else if(i2===-1||i2>i1){
    return uri.substring(0,i1);
  }
  else return uri.substring(0,i2);
};

/**
 * @async
 * @params {string=} root
 * @params {string=} prefix
 * @params {boolean=} disallowSharedCache
 * @returns {{accept:function,handle:function}}
 */
module.exports=async (root='www', prefix='', disallowSharedCache=false)=>{
  if (prefix&&prefix.charAt(prefix.length-1)==='/') prefix=prefix.substring(0,prefix.length-1);
  /**
   * @type {
   *   Map<string, {headers:Object<string,string>,data?:{identity:Buffer,br:Buffer?,gzip:Buffer?}}>
   * }
   */
  const cache=new Map();
  const sync=async ()=>{
    cache.clear();
    const walk=async dir=>{
      return (await Promise.all((await Promise.all(
        (await fs.readdir(dir)).
          map(async f=>{
            let start=f.lastIndexOf('/')+1;let end=f.lastIndexOf('.')+1;if(end===0)end=f.length;
            const path=`${dir}/${f}`;
            if(f[start]==='.') return { path: path };
            const ext=end<start?'':f.substring(end);
            const isDir = (await fs.lstat(path)).isDirectory();
            return isDir?{ path: path, directory: true }:{ path: path, type: types[ext] };
          })
        )).filter(it=>it.directory||it.type).map(async it=>it.directory?[it, ...await walk(it.path)]:it)
      )).flat(99);
    };
    const files=[{ path: root, directory: true }, ...await walk(root)];
    await Promise.all(files.map(async it=>{
      if(it.directory){
        const path = prefix + it.path.substring(root.length);
        const location = `${path}/`.replace(/[/]{2,}/,'/');
        cache.set(path, { headers: { 'Location': location } });
      }
      else{
        const type=it.type;
        const uncompressed=await fs.readFile(it.path);
        const headers=Object.assign({ 'ETag': etag(uncompressed) },type.headers);
        if(disallowSharedCache&&headers['Cache-Control']) headers['Cache-Control']=headers['Cache-Control'].replace('public','private');
        const data=type.compress?{
          identity: uncompressed,
          gzip: await gz(uncompressed),
          br: await br(uncompressed),
        }:{ identity: uncompressed };
        cache.set(
          (prefix + it.path.substring(root.length)).
            replace(/index.html$/,''),
          { data: data, headers: headers }
        );
      }
    }));
    [...cache.entries()].sort((a,b)=>{return a[0]<b[0]?-1:1}).forEach(it=>{
      if(it[1].data){
        if(it[1].data.br) console.log(`${it[0]} ${it[1].data.br.length} ${it[1].data.identity.length}`);
        else console.log(`${it[0]} ${it[1].data.identity.length}`);
      }
    });
    console.log('\n\n');
  };
  await sync();
  return {
    accept: (request,response,hostname,remoteAddress,local)=>{
      const path=uriPath(request.url);
      const found=cache.get(path);
      if(!found){
        return request.url==='/sync'&&local?[ null,request,response ]:null;
      }
      return [ found,request,response ];
    },
    handle: (accepted)=>{
      const  [ found,request,response ] = accepted;
      if(!found){
        (async ()=>{
          try{
            await sync();
            response.writeHead(200).end();
          }
          catch(err){
            response.writeHead(500,{'Content-Type':'text/plain'}).end(err.message);
          }
        })();
        return;
      }
      const method=request.method.toLowerCase();
      if(method!=='head'&&method!=='get') return response.writeHead(405).end();
      const headers=Object.assign({ 'Server': 'Custom', 'Vary': 'Accept-Encoding' },found.headers);
      if(!found.data) return response.writeHead(301,headers).end();
      const etag=request.headers['if-none-match'];
      if(etag&&etag===found.headers['ETag']) return response.writeHead(304,headers).end();
      if(found.data.br||found.data.gzip){
        const encoding=bestSupportedEncoding(request.headers);
        if(encoding){
          headers['Content-Encoding']=encoding;
          headers['Content-Length']=found.data[encoding].length;
          response.writeHead(200,headers);
          if(method!=='head') return response.end(found.data[encoding]);
          return response.end();
        }
        headers['Content-Length']=found.data.identity.length;
        response.writeHead(200,headers);
        if(method!=='head') return response.end(found.data.identity);
        return response.end();
      }
      headers['Content-Length']=found.data.identity.length;
      response.writeHead(200,headers);
      if(method!=='head') return response.end(found.data.identity);
      return response.end();
    }
  };

};

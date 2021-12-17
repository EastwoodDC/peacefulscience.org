require("dotenv").config() 
const axios = require('axios');
const urljoin = require('url-join');
const util   = require("util");
var os = require('os');
var fs = require('fs');
const Prince = require('prince');

const baseurl = "https://peacefulscience.org/";

async function docraptor(url) {
    const docraptor = "https://" + process.env.DOCRAPTOR + "@docraptor.com/docs";
    const params = {"test": true,
           "document_url": url,
           "type": "pdf" ,
           "prince_options": {
             baseurl: baseurl
           }};
           
    let response = await axios.post( docraptor, params, {
      responseType: 'arraybuffer'
    });
    
    return {
      isBase64Encoded: true,
      statusCode: response.status,
      body: Buffer.from(response.data, 'binary').toString('base64'),
      headers: {
        "content-type": response.headers["content-type"],
        "x-frame-options": 'SAMEORIGIN',
        "x-permitted-cross-domain-policies": 'none',
      }
    }    
}

async function prince(url) {
  let tfile = os.tmpdir()+"/output.pdf";
  let p = Prince();
  
  if (process.env.PRINCE) {
    p.config.binary = process.env.PRINCE;
  } else {
    p.config.binary = "/usr/local/bin/prince"
  }
  
  return await p
    .inputs(url)
    .output(tfile)
    .execute()
    .then(function () {
      return fs.readFileSync(tfile, null);
    })
    .then(function (buffer) {    
     return {    
      statusCode: 200,
      isBase64Encoded: true,
      body: buffer.toString('base64') ,
    }         
        
    }) 
}


exports.handler =  async function(event, context) {
    let route = event.path.toLowerCase();
    route = route.endsWith('/') ? route.slice(0, -1) : route;
    route = route.split('/');
    
    let path = route.slice(route.indexOf("pdf")+1);    
    let url = urljoin(baseurl, "_prince", path.join("/"));
    let canurl = urljoin(baseurl, path.join("/"));
    let title = path.slice(-1)[0];
    let section = path.slice(-2)[0];
    let name = `PS${section}-${title}.pdf`
    
    if (! ["articles", "about", "prints"].includes(section) )  {
      return {statusCode: 404}
    }
    
    let headers = event.headers;
    
    req_etags = headers["if-none-match"]?.split(",")
        .map(s => s.trim().replaceAll('"',''));
        
    req_etags = req_etags === null ? [] : req_etags;

    return axios.head(url, headers=headers)
      .then(res => { 
        for (req_etag of req_etags) {
          res_etag = res.headers['etag'].replaceAll('"','')
          if (req_etag.includes(res_etag)) {
            return {
              statusCode: 304,
              headers: {
                "etag": `"${req_etag}"`,
                "cache-control":  res.headers['cache-control'],
                "age":  res.headers['age'],
                "x-nf-request-id": res.headers['x-nf-request-id'],
              }
            }
          }
        }
        
        return prince(url)
          .catch( error => {return {statusCode: 500, body: util.inspect(error)}})
          .then(response => {
            if (response.statusCode === 200)
              response["headers"] = {
                "Content-Disposition": `filename="${name}"`,
                "Cache-Control": res.headers['cache-control'],
                "content-type": "application/pdf",
                "Link": `<${canurl}>; rel="canonical"`,
                "Etag": res.headers["etag"],
                "age":  res.headers['age'],
                "x-nf-request-id": res.headers['x-nf-request-id']
               }
            return response;
           })
      })
      .catch (error => {return {statusCode: error.response.status }})
      .then(r => {console.info( `${ r.statusCode }:\t${ url }\t${JSON.stringify(event.headers)}`); return r;} )   
}
     
    
    

     
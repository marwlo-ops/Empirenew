const server="EmpirefourkingdomsExGG2_3";
const base="https://empire-api.fly.dev";
async function call(command,params){
 const encoded=encodeURIComponent(JSON.stringify(params).slice(1,-1));
 const url=base+'/'+encodeURIComponent(server)+'/'+command+'/'+encoded;
 const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(20000)});
 const body=await response.json();
 console.log(JSON.stringify({command,http_status:response.status,return_code:body.return_code,error:body.error??null,hasContent:!!body.content,keys:body.content?Object.keys(body.content):[]}));
 return body;
}
await call("ain",{AID:115});
const x=789,y=516,spacing=13,tile=12,x1=Math.floor(x/spacing)*spacing,y1=Math.floor(y/spacing)*spacing;
for(const kid of [1,2,3]){
 await call("gaa",{KID:kid,AX1:x1,AY1:y1,AX2:x1+tile,AY2:y1+tile});
}

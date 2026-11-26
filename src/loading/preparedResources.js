const scopes=new WeakMap()
function record(scope,key,create){
 let cache=scopes.get(scope);if(!cache){cache=new Map();scopes.set(scope,cache)}
 let entry=cache.get(key)
 if(!entry){entry={};entry.promise=Promise.resolve().then(create).then(value=>{entry.value=value;entry.ready=true},error=>{entry.error=error});cache.set(key,entry)}
 return entry
}
export function prepareResource(scope,key,create){return record(scope,key,create).promise.then(()=>{const entry=record(scope,key,create);if(entry.error)throw entry.error;return entry.value})}
export function usePreparedResource(scope,key,create){
 const entry=record(scope,key,create)
 if(entry.error)throw entry.error
 if(!entry.ready)throw entry.promise
 return entry.value
}

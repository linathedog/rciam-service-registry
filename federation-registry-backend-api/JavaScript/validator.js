const countryData = require('country-region-data');
const { body,query, validationResult,param,check } = require('express-validator');
const {reg} = require('./regex.js');
const customLogger = require('./loggers.js');
var config = require('./config');
const {db} = require('./db');
let countryCodes =[];
var stringConstructor = "test".constructor;
countryData.forEach(country=>{
  countryCodes.push(country.countryShortCode);
});


const amsIngestValidation = () => {
  return [
    body('decoded_messages').exists().withMessage('No agents found').bail().isArray({min:1}).withMessage('No agents found').bail().toArray(),
    body('decoded_messages.*.id').exists().withMessage('Required Field').bail().isInt({gt:0}).withMessage('Id must be a positive integer'),
    body('decoded_messages.*.agent_id').exists().withMessage('Required Field').bail().isInt({gt:0}).withMessage('Agent id must be a positive integer'),
    body('decoded_messages.*.external_id').optional({checkFalsy:true}).isInt({gt:0}).withMessage('External id must be a positive integer'),
    body('decoded_messages.*.client_id').optional({checkFalsy:true}).isString().withMessage('Must be a string').bail().isLength({min:4, max:36}).bail()
  ]
}

const postInvitationValidation = () => {
  return[
    body('email').exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value,success=true)=> {if(!value.toLowerCase().match(reg.regEmail)){success=false} return success }).withMessage('Must be an email'),
    body('group_manager').exists().withMessage('Required Field').bail().custom((value)=> typeof(value)==='boolean').withMessage('Must be a boolean')
  ]
}

const putAgentValidation = () => {
  return [
    body('type').exists().withMessage('Required Field').bail().custom((value)=>{if(config.agent.type.includes(value)){return true}else{return false}}).bail(),
    body('entity_type').exists().withMessage('Required Field').bail().custom((value)=>{if(config.agent.entity_type.includes(value)){return true}else{return false}}).bail(),
    body('entity_protocol').exists().withMessage('Required Field').bail().custom((value)=>{if(config.agent.entity_protocol.includes(value)){return true}else{return false}}).bail(),
    body('hostname').exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Must be a url').bail()
  ]
}

const getServiceListValidation = () => {
  return [
    query('page').optional({checkFalsy:true}).isInt({gt:0}).withMessage('Page must be a positive integer').toInt(),
    query('limit').optional({checkFalsy:true}).isInt({gt:0}).withMessage('Limit must be a positive integer').toInt(),
    query('env').optional({checkFalsy:true}).isString().custom((value,{req,location,path})=> {   if(config.form[req.params.name].integration_environment.includes(value)){return true}else{return false}}).withMessage('Integration environment value not supported'),
    query('protocol').optional({checkFalsy:true}).isString().custom((value,{req,location,path})=> {if(config.form[req.params.name].protocol.includes(value)){return true}else{return false}}).withMessage('Protocol not supported'),
    query('owned').optional({checkFalsy:true}).isBoolean().toBoolean(),
    query('pending').optional({checkFalsy:true}).isBoolean().toBoolean(),
    query('search_string').optional({checkFalsy:true}).isString(),
  ]
}


const postAgentValidation = () => {
  return [
    body('agents').exists().withMessage('No agents found').bail().isArray({min:1}).withMessage('No agents found').bail().toArray(),
    body('agents.*.type').exists().withMessage('Required Field').custom((value)=>{ if(config.agent.type.includes(value)){return true}else{return false}}).bail(),
    body('agents.*.entity_type').exists().withMessage('Required Field').bail().custom((value)=>{if(config.agent.entity_type.includes(value)){return true}else{return false}}).bail(),
    body('agents.*.entity_protocol').exists().withMessage('Required Field').bail().custom((value)=>{if(config.agent.entity_protocol.includes(value)){return true}else{return false}}).bail(),
    body('agents.*.hostname').exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Must be a url').bail()
  ]
}


const tenantValidation = (options) => {
  return [
    param('tenant_name').custom((value,{req,location,path})=>{if(value in config.form){return true}else{return false}}).withMessage('Invalid Tenant in the url'),
  ]
}

const serviceValidationRules = (options) => {
  const required = (value,req,pos)=>{
    if(options.optional){
      if(!value){
        req.body[pos].outdated = true;
      }
      return true
    }
    else{
      return value
    }
  }

  const requiredOidc = (value,req,pos) => {
      if(options.optional||req.body[pos].protocol!=='oidc'){
        if(!value&&req.body[pos].protocol==='oidc'){
          req.body[pos].outdated = true;
        }
      return true
    }
    else{
      return value&&(req.body[pos].protocol==='oidc');
      }
  }

  const requiredSaml = (value,req,pos) => {
    if(options.optional||req.body[pos].protocol!=='saml'){
      if(!value&&req.body[pos].protocol==='saml'){
        req.body[pos].outdated = true;
      }
      return true;
    }
    else{
      return value&&(req.body[pos].protocol==='saml');
    }
  }


  return [
    body().isArray({min:1}).withMessage('Body must be an array containing at least one service'),
    body('*.tenant').custom((value,{req,location,path})=>{if(options.tenant_param||req.body[path.match(/\[(.*?)\]/)[1]].tenant in config.form){return true}else{return false}}).withMessage('Invalid Tenant'),
    body('*.service_name').custom((value,{req,location,path})=>{return required(value,req,path.match(/\[(.*?)\]/)[1])}).withMessage('Service name missing').if((value)=> {return value}).isString().withMessage('Service name must be a string').isLength({min:4, max:36}).withMessage('Service name must be from 4 up to 36 characters'),
    body('*.country').custom((value,{req,location,path})=>{
        return required(value,req,path.match(/\[(.*?)\]/)[1])
      }).withMessage('Country code missing').
      customSanitizer(value => {
        if(value){
          return value.toUpperCase();
        }else{
          return value;
        }
        }).
      custom((country) => {
        if(!country||countryCodes.includes(country)){
          return true
        }else{
          return false
        }
      }).withMessage('Invalid Country Code'),
    body('*.service_description').custom((value,{req,location,path})=>{return required(value,req,path.match(/\[(.*?)\]/)[1])}).withMessage('Service Description missing').if((value)=> {return value}).isString().withMessage('Service Description must be a string').isLength({min:1}).withMessage("Service description can't be empty"),
    body('*.logo_uri').optional({checkFalsy:true}).isString().withMessage('Service Logo must be a string').custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Service Logo must be a url'),
    body('*.policy_uri').custom((value,{req,location,path})=>{return required(value,req,path.match(/\[(.*?)\]/)[1])}).withMessage('Service Policy Uri missing').if((value)=> {return value}).isString().withMessage('Service Policy Uri must be a string').custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Service Policy Uri must be a url'),
    body('*.contacts').custom((value,{req,location,path})=>{return required(value,req,path.match(/\[(.*?)\]/)[1])}).withMessage('Service Contacts missing').if((value)=> {return value}).isArray({min:1}).withMessage('Service Contacts must be an array').custom((value,{req,location,path})=> {

      let tenant = options.tenant_param?req.params.tenant_name:req.body[path.match(/\[(.*?)\]/)[1]].tenant
      let success = true;
      try{
        value.map((contact,index)=>{
          if(contact.email&&!contact.email.toLowerCase().match(reg.regEmail)||!config.form[tenant].contact_types.includes(contact.type)){success=false}});
      }
      catch(err){
        if(Array.isArray(value)){
          success = false
        }
        else{
          success = true
        }
      }
      return success}).withMessage('Invalid contact'),
    body('*.protocol').exists({checkFalsy:true}).withMessage('Protocol missing').if(value=>{return value}).custom((value,{req,location,path})=> {
      let tenant = options.tenant_param?req.params.tenant_name:req.body[path.match(/\[(.*?)\]/)[1]].tenant;
      if(config.form[tenant].protocol.includes(value)){return true}else{return false}}).withMessage('Invalid Prorocol value'),
    body('*.client_id').if((value,{req,location,path})=>{return req.body[path.match(/\[(.*?)\]/)[1]].protocol==='oidc'}).exists({checkFalsy:true}).withMessage('client_id is missing').if(value=>{return value}).isString().withMessage('client_id must be a string').isLength({min:4, max:36}).withMessage('client_id must be between 4 and 36 characters').if(()=>{return options.check_available}).custom((value,{req,location,path})=> {
      let tenant = options.tenant_param?req.params.tenant_name:req.body[path.match(/\[(.*?)\]/)[1]].tenant;
      return db.service_details_protocol.checkClientId(value,0,0,tenant,req.body[path.match(/\[(.*?)\]/)[1]].integration_environment).then(available=> {
        if(!available){
          return Promise.reject('Not available ('+ value +')');
        }
        else{
          return Promise.resolve();
        }
      });
    }),
    body('*.redirect_uris').custom((value,{req,location,path})=>{return requiredOidc(value,req,path.match(/\[(.*?)\]/)[1])}).withMessage('Service redirect_uri missing').if((value,{req,location,path})=> {return value&&req.body[path.match(/\[(.*?)\]/)[1]].protocol==='oidc'}).isArray({min:1}).withMessage('Service redirect_uri must be an array').custom((value,success=true)=> {
      try{
        value.map((item,index)=>{if(!item.match(reg.regUrl)){success=false}});
      }
      catch(err){
        if(Array.isArray(value)){
          success = false
        }
        else{
          success = true
        }
      }
      return success}).withMessage("Service redirect_uri's must be secure urls"),
    body('*.scope').custom((value,{req,location,path})=>{return requiredOidc(value,req,path.match(/\[(.*?)\]/)[1])}).withMessage('Service redirect_uri missing').if((value,{req,location,path})=> {return value&&req.body[path.match(/\[(.*?)\]/)[1]].protocol==='oidc'}).isArray({min:1}).withMessage('Must be an array').custom((value,success=true)=> {
      try{
        value.map((item,index)=>{if(!item.match(reg.regScope)){success=false}});
      }
      catch(err){
        if(Array.isArray(value)){
          success = false
        }
        else{
          success = true
        }
      }
      return success }).withMessage('Invalid Scope value'),
    body('*.grant_types').custom((value,{req,location,path})=>{return requiredOidc(value,req,path.match(/\[(.*?)\]/)[1])}).withMessage('Service grant_types missing').if((value,{req,location,path})=> {return value&&req.body[path.match(/\[(.*?)\]/)[1]].protocol==='oidc'}).isArray({min:1}).withMessage('grant_types must be an array').custom((value,{req,location,path})=> {
      let success=true;
      let tenant = options.tenant_param?req.params.tenant_name:req.body[path.match(/\[(.*?)\]/)[1]].tenant;
      try{
        value.map((item,index)=>{if(!config.form[tenant].grant_types.includes(item)){success=false}});
      }
      catch(err){
        if(Array.isArray(value)){
          success = false
        }
        else{
          success = true
        }
      }
      return success }).withMessage('Invalid grant_type value'),
    body('*.jwks_uri').
      customSanitizer((value,{req,location,path})=>{
        if(req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method==="private_key_jwt"){
          return value
        }
        else{
          return null
        }
      }).
      if((value,{req,location,path})=>{return req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method==="private_key_jwt"}).
      custom((value,{req,location,path}) => {
        if(req.body[path.match(/\[(.*?)\]/)[1]].jwks&&value){
          throw new Error("Invalid private key option, only one of the following values should exist ['jwks','jwks_uri']");
        }
        else if(!(req.body[path.match(/\[(.*?)\]/)[1]].jwks||value)){
          throw new Error("Invalid private key option, one of the following values should exist ['jwks','jwks_uri']");
        }else if (value&&!value.match(reg.regSimpleUrl)){
          throw new Error("Private key uri must be a valid url");
        }
        return true
      }),
    body('*.jwks').customSanitizer((value,{req,location,path})=>{
        if(req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method==="private_key_jwt"){
          return value
        }
        else{
          return null
        }
      }).if((value,{req,location,path})=>{
        return req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method==="private_key_jwt"&&!req.body[path.match(/\[(.*?)\]/)[1]].jwks_uri&&value}).
      custom((value)=>{
        try{
          if(value.constructor === stringConstructor){
            value = JSON.parse(value);
          }
          if(value&&value.keys&&typeof(value.keys)==='object'&&Object.keys(value).length===1){
            return true
          }
          else{
            return false
          }
        }
        catch(err){
          return false
        }
      }).withMessage('Invalid Schema for private key'),
    body('*.token_endpoint_auth_method').custom((value,{req,location,path})=>{return requiredOidc(value,req,path.match(/\[(.*?)\]/)[1])}).withMessage('Service token_endpoint_auth_method missing').if((value,{req,location,path})=> {return value&&req.body[path.match(/\[(.*?)\]/)[1]].protocol==='oidc'}).custom((value,{req,location,path})=>{
      let tenant = options.tenant_param?req.params.tenant_name:req.body[path.match(/\[(.*?)\]/)[1]].tenant;
      if(!value||config.form[tenant].token_endpoint_auth_method.includes(value)){
        return true;
      }else{
        return false;
      }}).withMessage('Invalid token_endpoint_auth_method Method'),
    body('*.token_endpoint_auth_signing_alg').customSanitizer((value,{req,location,path}) => {
        if(!['private_key_jwt','client_secret_jwt'].includes(req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method)){
          return '';}
        else{return value}
      }).if((value,{req,location,path})=>{
        return (['private_key_jwt','client_secret_jwt'].includes(req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method))}).
      custom((value,{req,location,path})=>{
        return config.form[req.params.tenant_name].token_endpoint_auth_signing_alg.includes(value)}).
      withMessage('Invalid Token Endpoint Signing Algorithm'),
    body('*.id_token_timeout_seconds').optional({checkFalsy:true}).custom((value,{req,location,path})=> {
      let tenant = options.tenant_param?req.params.tenant_name:req.body[path.match(/\[(.*?)\]/)[1]].tenant;
      let max = config.form[tenant].id_token_timeout_seconds;
      if(!value||(parseInt(value)&&parseInt(value)<=max&&parseInt(value)>=0)){return true}else{
        throw new Error("id_token_timeout_seconds must be an integer in specified range [1-"+ max +"]")
      }}),
    body('*.access_token_validity_seconds').optional({checkFalsy:true}).custom((value,{req,location,path})=> {
      let tenant = options.tenant_param?req.params.tenant_name:req.body[path.match(/\[(.*?)\]/)[1]].tenant;
      let max = config.form[tenant].access_token_validity_seconds;
      if(parseInt(value)&&parseInt(value)<=max&&parseInt(value)>0){return true}else{
        throw new Error("id_token_timeout_seconds must be an integer in specified range [1-"+ max +"]")
      }}),
    body('*.refresh_token_validity_seconds').custom((value,{req,location,path})=> {
      let pos = path.match(/\[(.*?)\]/)[1];
        if(!value&&req.body[pos].scope&&req.body[pos].scope.includes('offline_access')){
          if(options.optional){
            req.body[pos].outdated = true;
            return true
          }
          else{
            return false
          }
        }else{
          return true
        }
      }).withMessage("Refresh Token Validity Seconds is required when 'offline_access' is included in the scopes").custom((value,{req,location,path})=> {
        if(!value){
          return true;
        }
        let tenant = options.tenant_param?req.params.tenant_name:req.body[path.match(/\[(.*?)\]/)[1]].tenant;
        let max = config.form[tenant].refresh_token_validity_seconds;
        if(parseInt(value)&&parseInt(value)<=max&&parseInt(value)>0){return true}else{
          throw new Error("Refresh Token Validity Seconds must be an integer in specified range [1-"+ max +"]")
        }
      }),
    body('*.device_code_validity_seconds').custom((value,{req,location,path})=> {
      let pos = path.match(/\[(.*?)\]/)[1];
      if(!value&&req.body[pos].grant_types&&req.body[pos].grant_types.includes('urn:ietf:params:oauth:grant-type:device_code')){
        if(options.optional){
          req.body[pos].outdated = true;
          return true
        }else{
          throw new Error("Device Code Validity Seconds is required when 'urn:ietf:params:oauth:grant-type:device_code' is included in the grant_types")
        }
      }
      if(!value){
        return true;
      }
      let tenant = options.tenant_param?req.params.tenant_name:req.body[path.match(/\[(.*?)\]/)[1]].tenant;
      let max = config.form[tenant].device_code_validity_seconds;
      if(parseInt(value)&&parseInt(value)<max&&parseInt(value)>0){return true}else{
        throw new Error("Device Code Validity Seconds must be an integer in specified range [1-"+ max +"]")
      }}).withMessage('Must be an integer in specified range'),
    body('*.code_challenge_method').custom((value,{req,location,path})=>{return requiredOidc(value,req,path.match(/\[(.*?)\]/)[1])}).withMessage('Device Code mising').if((value,{req,location,path})=> {return value&&req.body[path.match(/\[(.*?)\]/)[1]].protocol==='oidc'}).isString().withMessage('Device Code must be a string').custom((value)=> value.match(reg.regCodeChalMeth)).withMessage('Device Code invalid value'),
    body('*.allow_introspection').custom((value,{req,location,path})=>{return requiredOidc(value,req,path.match(/\[(.*?)\]/)[1])}).withMessage('Allow introspection mising').if((value,{req,location,path})=> {return value&&req.body[path.match(/\[(.*?)\]/)[1]].protocol==='oidc'}).custom((value)=> typeof(value)==='boolean').withMessage('Allow introspection must be a boolean').bail(),
    body('*.generate_client_secret').optional({checkNull:true}).custom((value)=> typeof(value)==='boolean').withMessage('Generate client secret must be a boolean'),
    body('*.reuse_refresh_tokens').optional({checkFalsy:true}).custom((value)=> typeof(value)==='boolean').withMessage('Reuse refresh tokens must be a boolean'),
    body('*.integration_environment').exists({checkFalsy:true}).withMessage('Integration Environment missing').if(value=>{return value}).custom((value,{req,location,path})=> {
      let tenant = options.tenant_param?req.params.tenant_name:req.body[path.match(/\[(.*?)\]/)[1]].tenant;
      if(config.form[tenant].integration_environment.includes(value)){return true}else{return false}}).withMessage('Invalid Integration Environment'),
    body('*.clear_access_tokens_on_refresh').optional({checkFalsy:true}).custom((value)=> typeof(value)==='boolean').withMessage('Clear access tokens on refresh must be a boolean').bail(),
    body('*.client_secret').customSanitizer((value,{req,location,path})=>{
        if(options.sanitize&&req.body[path.match(/\[(.*?)\]/)[1]].protocol!=='oidc'||['none',null,'private_key_jwt'].includes(req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method)){
          return null;
        }else{
          return value;
        }
      }).if((value,{req,location,path})=>{return ((value||!req.body[path.match(/\[(.*?)\]/)[1]].generate_client_secret)&&req.body[path.match(/\[(.*?)\]/)[1]].protocol==='oidc'&&["client_secret_basic","client_secret_post","client_secret_jwt"].includes(req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method))}).exists({checkFalsy:true}).withMessage('Client secret is missing').if((value)=>{return value}).isString().withMessage('Client Secret must be a string').isLength({min:4,max:64}),
    body('*.entity_id').custom((value,{req,location,path})=>{return requiredSaml(value,req,path.match(/\[(.*?)\]/)[1])}).withMessage('Entity id mising').if((value,{req,location,path})=> {return value&&req.body[path.match(/\[(.*?)\]/)[1]].protocol==='saml'}).isString().withMessage('Entity id must be a string').isLength({min:4, max:256}).custom((value)=> {return !value||value.match(reg.regSimpleUrl)}).withMessage('Entity id must be a url'),
    body('*.metadata_url').if((value,{req,location,path})=>{ return req.body[path.match(/\[(.*?)\]/)[1]].protocol==='saml'}).exists({checkFalsy:true}).withMessage('Metadata url missing').if(()=>{return value&&options.check_available}).custom((value)=> {if(!value){return true}else{return value.match(reg.regSimpleUrl)}}).withMessage('Metadata url must be a url').custom((value,{req,location,path})=> {
      return db.service_details_protocol.checkClientId(value,0,0,req.params.tenant_name,req.body[path.match(/\[(.*?)\]/)[1]].integration_environment).then(available=> {
        if(!available){
          return Promise.reject('Metadata url is not available');
        }
        else{
          return Promise.resolve();
        }
      });
    }),
    body('*.external_id').optional({checkFalsy:true}).custom((value)=>{if(parseInt(value)){return true}else{return false}}).withMessage('External id must be an integer')
  ]
}
//
//body('service_id').if*body('type'==='edit'||)
const servicePostValidationRules = (strict) => {
  return [
    // body().isArray({min:1}).withMessage('Body must be an array containing at least one service'),
    //body('*.country').exists().customSanitizer(value => {return value.toUpperCase();}).custom((country)=>{if(countryCodes.includes(country)){return true}else{return false}}).withMessage('Invalid Country Code'),
    //body('*.token_endpoint_auth_method').exists().custom((value,{req,location,path})=>{if(config.form[req.params.name].token_endpoint_auth_method.includes(value)){return true}else{return false}}).withMessage('Invalid Token Endpoint Authentication Method'),
    // body('*.token_endpoint_auth_signing_alg').customSanitizer((value,{req,location,path}) => {
    //     if(!['private_key_jwt','client_secret_jwt'].includes(req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method)){
    //       return '';}
    //     else{return value}
    //   }).if((value,{req,location,path})=>{return (['private_key_jwt','client_secret_jwt'].includes(req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method))}).
    //   custom((value,{req,location,path})=>{
    //     return config.form[req.params.name].token_endpoint_auth_signing_alg.includes(value)}).
    //   withMessage(' Token Endpoint Signing Algorithm'),
    // body('*.jwks_uri').
    //   customSanitizer((value,{req,location,path})=>{
    //     if(req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method==="private_key_jwt"){
    //       return value
    //     }
    //     else{
    //       return null
    //     }
    //   }).
    //   if((value,{req,location,path})=>{return req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method==="private_key_jwt"}).
    //   custom((value,{req,location,path}) => {
    //     if(req.body[path.match(/\[(.*?)\]/)[1]].jwks&&value){
    //       return false;
    //     }
    //     else{
    //       return true;
    //     }
    //   }).withMessage("Invalid private key option, only one of the following values should exist ['jwks','jwks_uri']").bail().
    //   custom((value)=>
    //     value.match(reg.regSimpleUrl)).withMessage('Private key uri must be a valid url').bail()
    //   ,
    // body('*.jwks').customSanitizer((value,{req,location,path})=>{
    //     if(req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method==="private_key_jwt"){
    //       console.log('success');
    //       return value
    //     }
    //     else{
    //       return null
    //     }
    //   }).
    //   if((value,{req,location,path})=>{return req.body[path.match(/\[(.*?)\]/)[1]].token_endpoint_auth_method==="private_key_jwt"}).
    //   custom(value=>{
    //     console.log(value);
    //     if(value&&value.keys&&typeof(value.keys)==='object'&&Object.keys(value).length===1){
    //       return true
    //     }
    //     else{
    //       return false
    //     }
    //   }).withMessage('Invalid Schema for private key'),
    //body('*.external_id').optional({checkFalsy:true}).exists().withMessage('Required Field').bail().custom((value)=>{if(parseInt(value)){return true}else{return false}}).bail(),
    //body('*.protocol').exists().withMessage('Required Field').bail().custom((value)=> {if(['oidc','saml'].includes(value)){return true}else{return false}}).withMessage('Invalid value'),
    //body('*.service_name').optional({checkFalsy:true}).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().isLength({min:4, max:36}).bail(),
    // body('*.client_id').if((value,{req,location,path})=>{return req.body[path.match(/\[(.*?)\]/)[1]].protocol==='oidc'}).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().isLength({min:4, max:36}).withMessage('Must be between 4 and 36 characters').bail().custom((value,{req,location,path})=> {
    //   return db.service_details_protocol.checkClientId(value,0,0,req.params.name,req.body[path.match(/\[(.*?)\]/)[1]].integration_environment).then(available=> {
    //     if(!available){
    //       return Promise.reject('Not available ('+ value +')');
    //     }
    //     else{
    //       return Promise.resolve();
    //     }
    //   });
    // }),
    //body('*.redirect_uris').optional({checkFalsy:true}).isArray({min:1}).withMessage('Must be an array').bail().custom((value,success=true)=> {value.map((item,index)=>{if(!item.match(reg.regUrl)){success=false}}); return success }).withMessage('Must be secure url').bail(),
    //body('*.logo_uri').optional({checkFalsy:true}).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Must be a url').bail(),
    //body('*.policy_uri').optional({checkFalsy:true}).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Must be a url').bail(),
    //body('*.service_description').optional({checkFalsy:true}).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().isLength({min:1}).bail(),
    //body('*.contacts').optional({checkFalsy:true}).if(param('name').custom((value)=> {tenant=value; return true;})).exists().withMessage('Required Field').bail().isArray({min:1}).withMessage('Must be an array').bail().custom((value,success=true)=> {value.map((item,index)=>{if(item.email&&!item.email.toLowerCase().match(reg.regEmail)||!config.form[tenant].contact_types.includes(item.type)){success=false}}); return success }).withMessage('Invalid value').bail(),
    //body('*.scope').optional({checkFalsy:true}).isArray({min:1}).withMessage('Must be an array').bail().custom((value,success=true)=> {value.map((item,index)=>{if(!item.match(reg.regScope)){success=false}}); return success }).withMessage('Invalid value').bail(),
    //body('*.grant_types').if(param('name').custom((value)=> {tenant=value; return true;})).optional({checkFalsy:true}).isArray({min:1}).withMessage('Must be an array').bail().custom((value,success=true)=> {value.map((item,index)=>{if(!config.form[tenant].grant_types.includes(item)){success=false}}); return success }).withMessage('Invalid value').bail(),
    //body('*.id_token_timeout_seconds').optional({checkFalsy:true}).custom((value)=> {if(parseInt(value)&&parseInt(value)<34128000&&parseInt(value)>0){return true}else{return false}}).withMessage('Must be an integer in specified range').bail(),
    //body('*.access_token_validity_seconds').optional({checkFalsy:true}).custom((value)=> {if(parseInt(value)&&parseInt(value)<34128000&&parseInt(value)>0){return true}else{return false}}).withMessage('Must be an integer in specified range').bail(),
    //body('*.refresh_token_validity_seconds').optional({checkFalsy:true}).custom((value)=> {if(parseInt(value)&&parseInt(value)<34128000&&parseInt(value)>0){return true}else{return false}}).withMessage('Must be an integer in specified range').bail(),
    //body('*.device_code_validity_seconds').optional({checkFalsy:true}).custom((value)=> {if(parseInt(value)&&parseInt(value)<34128000&&parseInt(value)>0){return true}else{return false}}).withMessage('Must be an integer in specified range').bail(),
    //body('*.code_challenge_method').optional({checkFalsy:true}).isString().withMessage('Must be a string').bail().custom((value)=> value.match(reg.regCodeChalMeth)).withMessage('Invalid value').bail(),
    //body('*.allow_introspection').optional({checkFalsy:true}).custom((value)=> typeof(value)==='boolean').withMessage('Must be a boolean').bail(),
    //body('*.generate_client_secret').optional({checkFalsy:true}).custom((value)=> typeof(value)==='boolean').withMessage('Must be a boolean').bail(),
    //body('*.reuse_refresh_tokens').optional({checkFalsy:true}).custom((value)=> typeof(value)==='boolean').withMessage('Must be a boolean').bail(),
    //body('*.integration_environment').if(param('name').custom((value)=> {tenant=value; return true;})).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=> {if(config.form[tenant].integration_environment.includes(value)){return true}else{return false}}).bail(),
    //body('*.clear_access_tokens_on_refresh').optional({checkFalsy:true}).custom((value)=> typeof(value)==='boolean').withMessage('Must be a boolean').bail(),
    //body('*.client_secret').optional({checkFalsy:true}).if(body('protocol').custom((value)=>{return value==='oidc'})&&(body('token_endpoint_auth_method').custom((value)=>{return value!=='private_key_jwt'&&value!=='none'}))).if((value,req)=> req.body.data.generate_client_secret=false).bail().isString().withMessage('Must be a string').bail().isLength({min:4,max:16}).bail(),
    //body('*.entity_id').optional({checkFalsy:true}).isString().withMessage('Must be a string').bail().isLength({min:4, max:256}).bail().custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Must be a url').bail(),
    // body('*.metadata_url').if((value,{req,location,path})=>{ return req.body[path.match(/\[(.*?)\]/)[1]].protocol==='saml'}).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Must be a url').bail().custom((value,{req,location,path})=> {
    //   return db.service_details_protocol.checkClientId(value,0,0,req.params.name,req.body[path.match(/\[(.*?)\]/)[1]].integration_environment).then(available=> {
    //     if(!available){
    //       return Promise.reject('Not available');
    //     }
    //     else{
    //       return Promise.resolve();
    //     }
    //   });
    // }),
  ]
}


const petitionValidationRules = () => {
  let tenant;
  return [
    body('service_id').if(body('type').custom((value)=>{return (value==='edit'||values==='delete')})).exists().withMessage('Required Field').bail().custom((value)=>{if(parseInt(value)){return true}else{return false}}).bail(),
    body('protocol').if(body('type').custom((value)=>{return value!=='delete'})).exists().withMessage('Required Field').bail().custom((value)=> {if(['oidc','saml'].includes(value)){return true}else{return false}}).withMessage('Invalid value'),
    body('type').exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=>{if(['edit','create','delete'].includes(value)){return true}else{return false}}).bail(),
    body('service_name').if(body('type').custom((value)=>{return value!=='delete'})).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().isLength({min:4, max:36}).bail(),
    body('client_id').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).optional({checkFalsy:true}).isString().withMessage('Must be a string').bail().isLength({min:4, max:36}).bail(),
    body('redirect_uris').if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().isArray({min:1}).withMessage('Must be an array').bail().custom((value,success=true)=> {value.map((item,index)=>{if(!item.match(reg.regUrl)){success=false}}); return success }).withMessage('Must be secure url').bail(),
    body('logo_uri').if(body('type').custom((value)=>{return value!=='delete'})).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Must be a url').bail(),
    body('policy_uri').if(body('type').custom((value)=>{return value!=='delete'})).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Must be a url').bail(),
    body('service_description').if(body('type').custom((value)=>{return value!=='delete'})).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().isLength({min:1}).bail(),
    body('contacts').if(param('name').custom((value)=> {tenant=value; return true;})).if(body('type').custom((value)=>{return value!=='delete'})).exists().withMessage('Required Field').bail().isArray({min:1}).withMessage('Must be an array').bail().custom((value,success=true)=> {value.map((item,index)=>{if(item.email&&!item.email.toLowerCase().match(reg.regEmail)||!config.form[tenant].contact_types.includes(item.type)){success=false}}); return success }).withMessage('Invalid value').bail(),
    body('scope').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().isArray({min:1}).withMessage('Must be an array').bail().custom((value,success=true)=> {value.map((item,index)=>{if(!item.match(reg.regScope)){success=false}}); return success }).withMessage('Invalid value').bail(),
    body('grant_types').if(param('name').custom((value)=> {tenant=value; return true;})).if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().isArray({min:1}).withMessage('Must be an array').bail().custom((value,success=true)=> {value.map((item,index)=>{if(!config.form[tenant].grant_types.includes(item)){success=false}}); return success }).withMessage('Invalid value').bail(),
    body('id_token_timeout_seconds').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().custom((value)=> {if(parseInt(value)&&parseInt(value)<34128000&&parseInt(value)>0){return true}else{return false}}).withMessage('Must be an integer in specified range').bail(),
    body('access_token_validity_seconds').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().custom((value)=> {if(parseInt(value)&&parseInt(value)<34128000&&parseInt(value)>0){return true}else{return false}}).withMessage('Must be an integer in specified range').bail(),
    body('refresh_token_validity_seconds').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().custom((value)=> {if(parseInt(value)&&parseInt(value)<34128000&&parseInt(value)>0){return true}else{return false}}).withMessage('Must be an integer in specified range').bail(),
    body('device_code_validity_seconds').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().custom((value)=> {if(parseInt(value)&&parseInt(value)<34128000&&parseInt(value)>0){return true}else{return false}}).withMessage('Must be an integer in specified range').bail(),
    body('code_challenge_method').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=> value.match(reg.regCodeChalMeth)).withMessage('Invalid value').bail(),
    body('allow_introspection').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().custom((value)=> typeof(value)==='boolean').withMessage('Must be a boolean').bail(),
    body('generate_client_secret').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().custom((value)=> typeof(value)==='boolean').withMessage('Must be a boolean').bail(),
    body('reuse_refresh_tokens').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().custom((value)=> typeof(value)==='boolean').withMessage('Must be a boolean').bail(),
    body('integration_environment').if(param('name').custom((value)=> {tenant=value; return true;})).if(body('type').custom((value)=>{return value!=='delete'})).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=> {if(config.form[tenant].integration_environment.includes(value)){return true}else{return false}}).bail(),
    body('clear_access_tokens_on_refresh').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).exists().withMessage('Required Field').bail().custom((value)=> typeof(value)==='boolean').withMessage('Must be a boolean').bail(),
    body('client_secret').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='oidc'})).if((value,req)=> req.body.data.generate_client_secret=false).bail().isString().withMessage('Must be a string').bail().isLength({min:4,max:16}).bail(),
    body('entity_id').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='saml'})).optional({checkFalsy:true}).isString().withMessage('Must be a string').bail().isLength({min:4, max:256}).bail().custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Must be a url').bail(),
    body('metadata_url').if(body('type').custom((value)=>{return value!=='delete'})).if(body('protocol').custom((value)=>{return value==='saml'})).exists().withMessage('Required Field').bail().isString().withMessage('Must be a string').bail().custom((value)=> value.match(reg.regSimpleUrl)).withMessage('Must be a url').bail(),
  ]
}


const decodeAms = (req,res,next) => {
  try{
    req.body.decoded_messages = [];
    req.body.messages.forEach(item=> {

      req.body.decoded_messages.push(JSON.parse(Buffer.from(item.message.data, 'base64').toString()));
    });
    next();
  }
  catch(err){
    customLogger(req,res,'warn','Failed decoding messages');
    res.status(422).send(err);
  }
}

const validate = (req, res, next) => {
  //console.log(req.body);
  const errors = validationResult(req);
  // if(errors.errors.length>0){
  //   console.log(errors);
  // }
  if (errors.isEmpty()) {
    return next();
  }
  const extractedErrors = []
  errors.array().map(err => extractedErrors.push({ [err.param]: err.msg }));
  var log ={};

  customLogger(req,res,'warn','Failed schema validation',extractedErrors);
  res.status(422).send(extractedErrors);
  return res.end();
}

module.exports = {
  tenantValidation,
  serviceValidationRules,
  petitionValidationRules,
  validate,
  decodeAms,
  amsIngestValidation,
  postInvitationValidation,
  putAgentValidation,
  postAgentValidation,
  getServiceListValidation
}
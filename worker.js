const {transformSync}  = require('@babel/core');

exports.transformFile = function(code){
    const transformResult = {code:''};
    
    try{
        transformResult.code = transformSync(code, {
            plugins: ['@babel/plugin-transform-modules-commonjs'],  
        }).code;
    }catch(e){
        transformResult.errorMessage = e.errorMessage;
    }
    return transformResult
}
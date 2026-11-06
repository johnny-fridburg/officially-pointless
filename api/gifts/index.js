'use strict';
const {publicGiftConfig,createProductLicenseVerifier}=require('../department-access');
const {createPublicGiftHandler}=require('../gift-service');
const config=publicGiftConfig();
module.exports=createPublicGiftHandler({...config,verifyLicense:createProductLicenseVerifier({products:config.products})});

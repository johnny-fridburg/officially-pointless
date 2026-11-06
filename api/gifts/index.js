'use strict';
const {publicGiftConfig,createProductLicenseVerifier}=require('../department-access');
const {createPublicGiftHandler}=require('../gift-service');
const {createIssuedCertificateVerifier}=require('../instance-proxy');
const config=publicGiftConfig();
const verifyIssuedCertificate=typeof createIssuedCertificateVerifier==='function'?createIssuedCertificateVerifier():null;
module.exports=createPublicGiftHandler({...config,enabled:false,verifyIssuedCertificate,verifyLicense:createProductLicenseVerifier({products:config.products}),verifyRemovalLicense:createProductLicenseVerifier({products:config.removalProducts})});

'use strict';
const {departmentConfig,createLicenseVerifier}=require('../department-access');
const {createDepartmentHandler}=require('../department-service');
const config=departmentConfig();
module.exports=createDepartmentHandler({...config,verifyLicense:createLicenseVerifier({productId:config.productId})});

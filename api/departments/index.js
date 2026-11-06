'use strict';
const {departmentConfig,createDepartmentLicenseVerifier}=require('../department-access');
const {createDepartmentHandler}=require('../department-service');
const config=departmentConfig();
module.exports=createDepartmentHandler({...config,enabled:false,verifyLicense:createDepartmentLicenseVerifier({products:config.removalProducts})});

'use strict';
const {createCommunityHandler}=require('../community-service');
const {createBlobStore}=require('../community-store');
const {createGoogleVerifier}=require('../google-identity');
const clientId=process.env.POINTLESS_GOOGLE_CLIENT_ID;
const enabled=process.env.POINTLESS_COMMUNITY_ENABLED==='true';
module.exports=createCommunityHandler({store:enabled?createBlobStore(process.env.POINTLESS_COMMUNITY_BLOB_URL):null,clientId:clientId||null,verifyIdentity:clientId?createGoogleVerifier({clientId}):null,adminToken:process.env.POINTLESS_COMMUNITY_ADMIN_TOKEN});

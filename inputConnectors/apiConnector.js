const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('percocologger')
const config = require('../config.js');
let attrWithUrl = config.orion?.attrWithUrl || "datasetUrl"

async function createOrionSubscription({
    orionBaseUrl,       
    entityType,        
    attrWithUrl,        
    notificationUrl,   
    fiwareService,      
    fiwareServicePath   
}) {
    if (await checkMultipleSubscriptions(notificationUrl) > 0) 
        return logger.warn(message = "Multiple existing subscriptions found for the same notification URL. Consider cleaning them up.") || message;
    const sub = {
        description: `Query engine subscription`,
        subject: {
            entities: [{ idPattern: '.*' }],
        },

        notification: {
            http: { url: notificationUrl },
            "attrs": [],
        },
        throttling: 1
    };

    const headers = { 'Content-Type': 'application/json' };
    if (fiwareService) headers['Fiware-Service'] = fiwareService;
    if (fiwareServicePath) headers['Fiware-ServicePath'] = fiwareServicePath;

    const url = `${orionBaseUrl.replace(/\/$/, '')}/v2/subscriptions`;
    const res = await axios.post(url, sub, { headers });
    return res.data; 
}

createOrionSubscription({
    orionBaseUrl: config.orion?.orionBaseUrl || 'http://localhost:1027',
    entityType: config.orion?.entityType || "Thing",
    attrWithUrl,
    notificationUrl: config.orion?.notificationUrl || 'http://host.docker.internal:3000/api/orion/subscribe',
    fiwareService: config.orion?.fiwareService || "service",
    fiwareServicePath: config.orion?.fiwareServicePath || "/service"
}).then(sub => {
    logger.info("Orion subscription created: ", sub)
}).catch(err => {
    logger.error("Error creating Orion subscription: ", err.response?.data || err.message || err)
    logger.error(err.response?.config?.data)
    process.exit()
})

async function getSubscriptions() {
    return (await axios.get('http://localhost:1027/v2/subscriptions', { headers: { 'Fiware-Service': 'service', 'Fiware-ServicePath': '/service' } })).data
}

async function deleteSubscription(subId) {
    return (await axios.delete(`http://localhost:1027/v2/subscriptions/${subId}`, { headers: { 'Fiware-Service': 'service', 'Fiware-ServicePath': '/service' } })).data
}

async function checkMultipleSubscriptions(notificationUrl) {
    let subscriptions = await getSubscriptions()
    let count = 0
    for (let sub of subscriptions) {
        if (config.deleteAllDuplicateOrionSubscriptions && sub.notification?.http?.url === notificationUrl) {
            if (count > 0) {
                console.log(`Deleting duplicate subscription with id ${sub.id}`)
                await deleteSubscription(sub.id)
            }
            else
                count++
        }
        else if (sub.subject?.entities?.[0]?.idPattern === '.*' && sub.notification?.http?.url === notificationUrl && sub.description === `Query engine subscription`) {
            if (count > 0) {
                console.log(`Deleting duplicate subscription with id ${sub.id}`)
                await deleteSubscription(sub.id)
            }
            else
                count++
        }
    }
    return count;
}

module.exports = { createOrionSubscription };
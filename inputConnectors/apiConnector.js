const express = require('express');
const axios = require('axios');
const logger = require('percocologger')
const config = require('../config.js');

async function createOrionSubscription({
    orionBaseUrl,
    notificationUrl,
    fiwareService,
    fiwareServicePath
}) {
    if (await checkMultipleSubscriptions(notificationUrl) > 0)
        return logger.warn(message = "Already existing subscription found for the same notification URL.") || message;
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

if (config.orion.subscribe)
    createOrionSubscription({
        orionBaseUrl: config.orion?.orionBaseUrl || 'http://localhost:1027',
        notificationUrl: config.orion?.notificationUrl || 'http://host.docker.internal:3000/api/orion/subscribe',
        fiwareService: config.orion?.fiwareService || "service",
        fiwareServicePath: config.orion?.fiwareServicePath || "/service"
    }).then(sub => {
        if (sub != "Already existing subscription found for the same notification URL.")
            logger.info("Orion subscription created: " + sub)
    }).catch(err => {
        logger.error("Error creating Orion subscription: ", err.response?.data || err.message || err)
        err.response?.config?.data && logger.error(err.response?.config?.data)
    })

async function getSubscriptions() {
    return (await axios.get((config.orion.orionBaseUrl || 'http://localhost:1027') + '/v2/subscriptions', { headers: { 'Fiware-Service': 'service', 'Fiware-ServicePath': '/service' } })).data
}

async function deleteSubscription(subId) {
    return (await axios.delete(`${(config.orion.orionBaseUrl || 'http://localhost:1027')}/v2/subscriptions/${subId}`, { headers: { 'Fiware-Service': 'service', 'Fiware-ServicePath': '/service' } })).data
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
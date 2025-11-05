const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('percocologger')
const config = require('../config.js');
let attrWithUrl = config.orion?.attrWithUrl || "datasetUrl"

// utils/apiInputConnector.js
// GitHub Copilot
// Simple Orion NGSIv2 subscription + notification endpoint that downloads dataset URLs
// Dependencies: express, axios, body-parser (or use express.json()), fs, path
// Usage example at bottom.


async function createOrionSubscription({
    orionBaseUrl,        // e.g. 'http://orion:1026'
    entityType,          // entity type to watch, or '.*' to watch all types
    attrWithUrl,         // attribute name that contains the dataset URL
    notificationUrl,     // e.g. 'http://myhost:3000/notify'
    fiwareService,       // optional Fiware-Service header
    fiwareServicePath    // optional Fiware-ServicePath header
}) {
    if (await checkMultipleSubscriptions(notificationUrl) > 0) 
        return logger.warn(message = "Multiple existing subscriptions found for the same notification URL. Consider cleaning them up.") || message;
    const sub = {
        description: `Query engine subscription`,
        subject: {
            entities: [{ idPattern: '.*' }],//, type: entityType }]//,
            //condition: { attrs: [attrWithUrl] }
        },

        notification: {
            http: { url: notificationUrl },// notificationUrl }//,
            "attrs": [],

            // attrs: [attrWithUrl]
            // optionally set attrsFormat or metadata if needed
        },
        // "attrs": [],

        // prevent too frequent notifications
        throttling: 1
    };

    const headers = { 'Content-Type': 'application/json' };
    if (fiwareService) headers['Fiware-Service'] = fiwareService;
    if (fiwareServicePath) headers['Fiware-ServicePath'] = fiwareServicePath;

    const url = `${orionBaseUrl.replace(/\/$/, '')}/v2/subscriptions`;
    const res = await axios.post(url, sub, { headers });
    return res.data; // contains subscription id or response
}

createOrionSubscription({
    orionBaseUrl: config.orion?.orionBaseUrl || 'http://localhost:1027',
    entityType: config.orion?.entityType || "Thing",//'.*',
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

function startNotificationServer({
    port = 3000,
    notifyPath = '/notify',
    downloadDir = path.join(__dirname, '..', 'downloads'),
    attrWithUrl = 'datasetUrl', // default attribute name
    onDownloaded // optional callback (entity, filePath)
}) {
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

    const app = express();
    app.use(express.json({ limit: '10mb' }));

    app.post(notifyPath, async (req, res) => {
        // Orion NGSIv2 sends notifications with structure { subscriptionId, data: [entities...] }
        try {
            const originator = req.headers['fiware-originator'] || req.body.originator || '-';
            const data = req.body.data || req.body.value || [];
            if (!Array.isArray(data)) {
                // sometimes Orion sends single entity in 'data' as object
            }

            const entities = Array.isArray(data) ? data : [data];

            for (const ent of entities) {
                const id = ent.id || ent['@id'] || 'unknown-id';
                // attribute might be keyValues format or object with value
                let urlValue;
                if (ent[attrWithUrl] && typeof ent[attrWithUrl] === 'object' && 'value' in ent[attrWithUrl]) {
                    urlValue = ent[attrWithUrl].value;
                } else if (ent[attrWithUrl]) {
                    urlValue = ent[attrWithUrl];
                } else if (ent[attrWithUrl + ':value']) {
                    urlValue = ent[attrWithUrl + ':value'];
                } else if (ent.value) {
                    // fallback if notification was keyValues
                    urlValue = ent.value;
                }

                if (!urlValue || typeof urlValue !== 'string') {
                    console.warn(`[notify] no URL found for entity ${id}`);
                    continue;
                }

                try {
                    const parsed = new URL(urlValue);
                    const filename = `${id}-${path.basename(parsed.pathname) || 'dataset'}`;
                    const outPath = path.join(downloadDir, filename);

                    const response = await axios.get(urlValue, { responseType: 'stream', timeout: 30_000 });
                    const writer = fs.createWriteStream(outPath);
                    response.data.pipe(writer);

                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });

                    console.log(`[notify] downloaded ${urlValue} -> ${outPath}`);
                    if (typeof onDownloaded === 'function') onDownloaded(ent, outPath);
                } catch (err) {
                    console.error(`[notify] failed to download ${urlValue}:`, err.message || err);
                }
            }

            // respond quickly to Orion
            res.status(200).send('OK');
        } catch (err) {
            console.error('[notify] error handling notification:', err);
            res.status(500).send('error');
        }
    });

    const server = app.listen(port, () => {
        console.log(`Notification server listening http://0.0.0.0:${port}${notifyPath}`);
    });

    return { app, server };
}

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

async function cancelAllOrionSubscriptions() {
    try {
        let subscriptions = await getSubscriptions()
        console.log(`Found ${subscriptions.length} existing subscriptions`)
        for (let sub of subscriptions) {
            console.log(`Deleting subscription ${sub.id}`)
            await deleteSubscription(sub.id)
        }
    }
    catch (error) {
        console.error("Error while cancelling Orion subscriptions : " + error.toString())
    }
}

/*
cancelAllOrionSubscriptions().then(() => {
    console.log("All existing Orion subscriptions cancelled")
}).catch((error) => {
    console.error("Error while cancelling Orion subscriptions : " + error.toString())
});*/

// Example usage (uncomment and adapt):
/*
(async () => {
    const ORION = 'http://orion:1026';
    const SERVICE = 'myservice';
    const SERVICE_PATH = '/';
    const ENTITY_TYPE = 'DatasetEntity';
    const ATTR_URL = 'datasetUrl';
    const NOTIFY_HOST = 'http://mypublichost:3000/notify';

    // start receiver
    startNotificationServer({
        port: 3000,
        notifyPath: '/notify',
        downloadDir: path.join(__dirname, '..', 'downloads'),
        attrWithUrl: ATTR_URL,
        onDownloaded: (entity, filePath) => {
            // further processing: upload to MinIO, import to DB, etc.
            console.log('Downloaded for entity', entity.id, '->', filePath);
        }
    });

    // create subscription on Orion
    try {
        const res = await createOrionSubscription({
            orionBaseUrl: ORION,
            entityType: ENTITY_TYPE,
            attrWithUrl: ATTR_URL,
            notificationUrl: NOTIFY_HOST,
            fiwareService: SERVICE,
            fiwareServicePath: SERVICE_PATH
        });
        console.log('Created subscription:', res);
    } catch (err) {
        console.error('Failed to create subscription:', err.response ? err.response.data : err.message);
    }
})();
*/

module.exports = { createOrionSubscription, startNotificationServer };
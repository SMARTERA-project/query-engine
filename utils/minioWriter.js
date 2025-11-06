const Minio = require('minio')
const common = require('./common.js')
const { sleep, getEntries, setType } = common
const config = require('../config.js')
const { minioConfig, delays, queryAllowedExtensions } = config
const Source = require('../api/models/Source.js')//TODO divide collections by email and/or bucket
const minioClient = new Minio.Client(minioConfig)
const fs = require('fs');
const logFile = 'log.txt';
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const logger = require('percocologger')
const log = logger.info
const axios = require('axios')
process.queryEngine = {updatedOwners: {}}

module.exports = {

  entities: {
    values: [],
    uniqueValues: [],
    entries: [],
    uniqueEntries: [],
    keys: [],
    uniqueKeys: []
  },

  entries: {

  },

  client: undefined,

  async listObjects(bucketName) {

    let resultMessage
    let errorMessage

    let data = []
    let stream = minioClient.listObjects(bucketName, '', true, { IncludeVersion: true })
    stream.on('data', function (obj) {
      data.push(obj)
    })
    stream.on('end', function (obj) {
      if (!obj)
        log("ListObjects ended returning an empty object")
      else
        log("Found object ")
      if (data[0])
        resultMessage = data
      else if (!resultMessage)
        resultMessage = []
    })
    stream.on('error', function (err) {
      log(err)
      errorMessage = err
    })

    let logCounterFlag
    while (!errorMessage && !resultMessage) {
      await sleep(delays)
      if (!logCounterFlag) {
        logCounterFlag = true
        sleep(delays + 2000).then(resolve => {
          if (!errorMessage && !resultMessage)
            log("waiting for list")
          logCounterFlag = false
        })
      }
    }
    if (errorMessage)
      throw errorMessage
    if (resultMessage)
      return resultMessage
  },

  async deleteInDBs(record) {
    let postgreFinished, logCounterFlag
    let table = common.urlEncode(record?.s3?.bucket?.name || record.bucketName)
    this.client.query(`DELETE FROM ${table} WHERE name = '${record?.s3?.object?.key || record.name}'`, (err, res) => {
      if (err) {
        log("ERROR inserting object in DB");
        log(err);
        postgreFinished = true
        return;
      }
      log("Object deleted \n");
      postgreFinished = true
      return
    });

    while (!postgreFinished) {
      await sleep(delays)
      if (!logCounterFlag) {
        logCounterFlag = true
        sleep(delays + 2000).then(resolve => {
          if (!postgreFinished)
            log("Waiting for deleting object in postgre")
          logCounterFlag = false
        })
      }
    }

    try {
      log("Delete ", record?.s3?.object?.key || record.name)
      await Source.deleteMany({ 'name': (record?.s3?.object?.key || record.name) })//record.s3.object
    }
    catch (error) {
      log(error)
    }
  },

  getTypeRecursive(obj) {
    if (!Array.isArray(obj))
      for (let key in obj)
        if (Array.isArray())
          type = "array"
        else
          switch (type = obj[key]) {
            case "number": query = query + "INTEGER,"; break;
            case "string": query = query + "TEXT,"; break;
            case "array": query = query + this.getTypeRecursive(obj[key]); break; // e.g. INTEGER[]
            case "object": query = query + "JSONB,"; break;
            case "boolean": query = query + "BOOLEAN"; break;
          }
  },

  createTable(table, obj) {
    let query = "CREATE TABLE  " + table + " (id SERIAL PRIMARY KEY, name TEXT NOT NULL" //, type
    if (typeof obj == "string") {
      log("Now parsing")
      obj = JSON.parse(obj)
    }
    if (!Array.isArray(obj))
      for (let key in obj)
        if (Array.isArray(obj[key]))
          query = query + this.getTypeRecursive(obj[key])
        else
          switch (typeof obj[key]) {
            case "number": query = query + ", " + key + " INTEGER"; break;
            case "string": query = query + ", " + key + " TEXT"; break;
            case "object": query = query + ", " + key + " JSONB"; break;
            case "boolean": query = query + ", " + key + " BOOLEAN"; break;
          }
    query = query + ", record JSONB)"
    return query
  },

  getKeys(str) {
    str.split("id SERIAL PRIMARY KEY, name TEXT NOT NULL")[1].split(", record JSONB)")[0].split(",")
  },

  getValues() {

  },

  async insertInDBs(newObject, record, align) {
    log("Insert in DBs ", record?.s3?.object?.key || record.name)
    let csv = false
    let jsonParsed, jsonStringified, postgreFinished, logCounterFlag
    if (typeof newObject != "object")
      try {
        jsonParsed = JSON.parse(newObject)
      }
      catch (error) {

        let extension = (record?.s3?.object?.key || record.name).split(".").pop()
        if (extension == "csv")
          jsonStringified = common.convertCSVtoJSON(newObject)
        csv = true
      }
    else {
      jsonParsed = newObject
    }

    let table = common.urlEncode(record?.s3?.bucket?.name || record.bucketName)

    let queryName = record?.s3?.object?.key || record.name
    let queryTable = this.createTable(table)
    let data = (jsonStringified || common.cleaned(newObject))
    if (typeof data != "string")
      data = JSON.stringify(data)
    let owner
    try {
      if (config.updateOwner == "later")
        owner = "unknown"
      else {
        owner = (await axios.get(config.minioConfig.ownerInfoEndpoint + "/createdBy?filePath=" + queryName + "&etag=" + record.etag)).data
      }
    }
    catch (error) {
      logger.error("Error getting owner")
      logger.error(error)
    }
    log("Owner ", owner)
    record = { ...record, insertedBy: owner }
    this.client.query("SELECT * FROM " + table + " WHERE name = '" + queryName + "'", async (err, res) => {
      if (err) {
        log("ERROR searching object in DB");
        log(err);

        this.client.query("CREATE TABLE  " + table + " (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, data JSONB, record JSONB)", (err, res) => {

          if (err) {
            log("ERROR creating table");
            log(err);
            postgreFinished = true
            return;
          }
       
          this.client.query(`INSERT INTO ${table} (name, data, record) VALUES ('${record?.s3?.object?.key || record.name}', '${data}', '${JSON.stringify(record)}')`, (err, res) => {

            if (err) {
              log("ERROR inserting object in DB");
              log(err);
              postgreFinished = true
              return;
            }
            log("Object inserted \n");
            postgreFinished = true
            return
          });

        });
        while (!postgreFinished) { //TODO create a function for this
          await sleep(delays)
          if (!logCounterFlag) {
            logCounterFlag = true
            sleep(delays + 2000).then(resolve => {
              if (!postgreFinished)
                log("waiting for inserting object in postgre")
              logCounterFlag = false
            })
          }
        }
        if (postgreFinished)
          return postgreFinished
      }
      if (res.rows[0]) {
        log("Objects found \n ")//, common.minify(res.rows));
        this.client.query(`UPDATE ${table} SET data = '${data}', record = '${JSON.stringify(record)}'  WHERE name = '${record?.s3?.object?.key || record.name}'`, (err, res) => {
          if (err) {
            log("ERROR updating object in DB");
            log(err);
            postgreFinished = true
            return;
          }
          postgreFinished = true
          log("Object updated \n");
          return
        });
      }
      else
        this.client.query(`INSERT INTO ${table} (name, data, record) VALUES ('${record?.s3?.object?.key || record.name}', '${data}', '${JSON.stringify(record)}' )`, (err, res) => {
          if (err) {
            log("ERROR inserting object in DB");
            log(err);
            postgreFinished = true
            return;
          }
          log("Object inserted \n");
          postgreFinished = true
          return
        });

    });

    if ((!jsonParsed) || (jsonParsed && typeof jsonParsed != "object"))
      try {
        jsonParsed = JSON.parse(jsonStringified || newObject)
      }
      catch (error) {
        log(error)
      }

    try {// TODO better doing an update...
      log("Delete ", (record?.s3?.object?.key || record.name))
      await Source.deleteMany({ 'name': (record?.s3?.object?.key || record.name) })//record.s3.object
    }
    catch (error) {
      log(error)
    }
    let name = record?.s3?.object?.key || record.name
    name = name.split(".")
    let extension = name.pop()
    log("Extension ", extension)
    log("Is array : ", Array.isArray(jsonParsed))
    log("Type ", typeof jsonParsed)

    if (!jsonParsed)
      log("Empty object of extension ", extension)

    let insertingSource = [
      extension == "csv" ?
        { csv: jsonParsed, record, name: record?.s3?.object?.key || record.name } :
        Array.isArray(jsonParsed) ?
          { json: jsonParsed, record, name: record?.s3?.object?.key || record.name } :
          typeof jsonParsed == "object" ?
            { ...jsonParsed, record, name: record?.s3?.object?.key || record.name } :
            { raw: jsonParsed, record, name: record?.s3?.object?.key || record.name }
    ]
    try {
      await Source.insertMany(insertingSource)
    }
    catch (error) {
      if (!error?.errorResponse?.message?.includes("Document can't have"))
        log(error)
      try {
        await Source.insertMany(JSON.parse(JSON.stringify(insertingSource).replace(/\$/g, '')))
      }
      catch (error) {
        log("There are problems inserting object in mongo DB")
        log(error)
      }
    }
    logger.trace("before get type")
    logger.trace(JSON.stringify(jsonParsed).substring(0, 30))
    let type = await setType(extension, jsonParsed) // csv, jsonArray, json, raw
    logger.trace("type")
    logger.trace(type)
    if (type != "raw")
      try {
        await getEntries(insertingSource, type, record?.s3?.object?.key || record.name, this.entries)
      }
      catch (error) {
        logger.error(error)
      }
    while (!postgreFinished) {
      await sleep(delays)
      if (!logCounterFlag) {
        logCounterFlag = true
        sleep(delays + 2000).then(resolve => {
          if (!postgreFinished)
            log("object inserted in mongo db but still waiting for inserting object in postgre")
          logCounterFlag = false
        })
      }
    }
    if (postgreFinished)
      return postgreFinished
  },

  getNotifications(bucketName) {

    const poller = minioClient.listenBucketNotification(bucketName, '', '', ["s3:ObjectCreated:*", "s3:ObjectRemoved:*"])
    poller.on('notification', async (record) => {
      log('New object: %s/%s (size: %d)', record.s3.bucket.name, record.s3.object.key, record.s3.object.size || 0)
      let extension = record.s3.object.key.split(".").pop()
      let isAllowed = (queryAllowedExtensions == "all" || queryAllowedExtensions.includes(extension))
      let newObject
      try {
        if (record.eventName != 's3:ObjectRemoved:Delete' && record.s3.object.size && isAllowed) {
          log("Getting object")
          newObject = await this.getObject(record.s3.bucket.name, record.s3.object.key, record.s3.object.key.split(".").pop())
          log("Got")
        }
      }
      catch (error) {
        log("Error during getting object")
        logger.error(error)
        return
      }
      if (newObject)
        log("New object\n", common.minify(newObject), "\ntype : ", typeof newObject)
      if (isAllowed)
        if (record.eventName != 's3:ObjectRemoved:Delete')
          if (record.s3.object.size)
            await this.insertInDBs(newObject, record, false)
          else
            log("Size is ", record.s3.object.size || 0, " and extension ", (isAllowed ? "is allowed" : "is not allowed"))
        else
          await this.deleteInDBs(record)
      else
        log("Size is ", record.s3.object.size || 0, " and extension ", (isAllowed ? "is allowed" : "is not allowed"))

    })
    poller.on('error', (error) => {
      log("Error on poller")
      log(error)
    })
  },

  async listBuckets() {
    return await minioClient.listBuckets()
  },

  async getObject(bucketName, objectName, format) {

    logger.trace("Now getting object " + objectName + " in bucket " + bucketName)

    let resultMessage
    let errorMessage

    minioClient.getObject(bucketName, objectName, function (err, dataStream) {
      if (err) {
        errorMessage = err
        log(err)
        return err
      }

      let objectData = '';
      dataStream.on('data', function (chunk) {
        objectData += chunk;
      });

      dataStream.on('end', function () {
        try {
          resultMessage = (format == 'json' && typeof objectData == "string") ? JSON.parse(objectData) : objectData

        }
        catch (error) {
          try {
            if (config.parseCompatibilityMode === 1)
              resultMessage = (format == 'json' && typeof objectData == "string") ? JSON.parse(objectData.substring(1)) : objectData
            else
              resultMessage = (format == 'json' && typeof objectData == "string") ? JSON.parse(objectData.substring(objectData.indexOf("{"))) : objectData
          }
          catch (error) {
            resultMessage = format == 'json' ? [{ data: objectData }] : objectData
          }
        }
        if (!resultMessage)
          resultMessage = "Empty file"
      });

      dataStream.on('error', function (err) {
        log('Error reading object:')
        errorMessage = err
        log(err)
      });

    });

    let logCounterFlag
    while (!errorMessage && !resultMessage) {
      await sleep(delays)
      if (!logCounterFlag) {
        logCounterFlag = true
        sleep(delays + 2000).then(resolve => {
          if (!errorMessage && !resultMessage)
            log("waiting for object " + objectName + " in bucket " + bucketName)
          logCounterFlag = false
        })
      }
    }
    if (errorMessage)
      throw errorMessage
    if (resultMessage)
      return resultMessage
  }
}
/* eslint-disable import/prefer-default-export, no-console */
import saveToDB from '@eubfr/dynamodb-helpers/save';

const path = require('path');
const AWS = require('aws-sdk'); // eslint-disable-line import/no-extraneous-dependencies
const parse = require('csv-parse');

export const parseCsv = (event, context, callback) => {
  /*
   * Some checks here before going any further
   */

  // Only work on the first record
  const snsRecord = event.Records[0];

  // Was the lambda triggered correctly? Is the file extension supported? etc.
  if (!snsRecord || snsRecord.EventSource !== 'aws:sns') {
    return callback('Bad record');
  }

  /*
   * Prepare file analysis
   */

  // Extract message
  const message = JSON.parse(snsRecord.Sns.Message);

  // Check file extension
  if (path.extname(message.object.key) !== '.csv') {
    return callback('File extension should be .csv');
  }

  /*
   * Configure the parser
   */
  const parser = parse({ columns: true });
  const dynamo = new AWS.DynamoDB();

  parser.on('readable', () => {
    let record;
    // eslint-disable-next-line
    while ((record = parser.read())) {
      /*
       * Transform message
       */

      /*
       * Map fields
       */

      // Map the fields
      const data = {
        source: message.object.key,
        title: record.Name,
        programme_name: record['Programme name'],
        description: record['Project description'],
        results: record.Results,
        ec_priorities: record['EC’s priorities'].split(','),
        coordinators: record.Coordinators.split(','),
        eu_budget_contribution: record['EU Budget contribution'],
        partners: record.Partners.split(','),
        project_locations: [
          {
            name: record['Project country(ies)'],
            geolocation: {
              lat: record['Project location latitude'],
              long: record['Project location longitude'],
            },
          },
        ],
        timeframe: {
          from: record['Timeframe start'],
          to: record['Timeframe end'],
        },
      };

      /*
       * Save to DB
       */

      saveToDB(dynamo, process.env.TABLE, data, err => {
        if (err) {
          console.log(err);
        }
      });
    }
  });

  // Catch any error
  parser.on('error', err => {
    console.log(err.message);
  });

  // When we are done, test that the parsed output matched what expected
  parser.on('finish', () => {});

  /*
   * Start the hard work
   */
  const s3 = new AWS.S3();

  return s3
    .getObject({
      Bucket: message.bucket.name,
      Key: message.object.key,
    })
    .createReadStream()
    .pipe(parser);
};

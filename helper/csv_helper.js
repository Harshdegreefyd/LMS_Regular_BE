import { Parser } from 'json2csv';

export function convertToCSV(data, fields, fieldNames) {
  const flatData = data.map((item) => {
    const flattened = {};

    fields.forEach((field) => {
      if (field.includes('.')) {
        const parts = field.split('.');
        let val = item;
        for (const part of parts) {
          val = val ? val[part] : '';
        }
        flattened[field] = val ?? '';
      } else {
        flattened[field] = item[field] ?? '';
      }
    });

    return flattened;
  });

  const parser = new Parser({ fields, fieldNames });
  return parser.parse(flatData);
}

import { EntityMetadata } from 'typeorm';

function mapColumnTypeToGraphQL(type: string): string {
  const map: Record<string, string> = {
    int: 'Int',
    integer: 'Int',
    float: 'Float',
    double: 'Float',
    decimal: 'Float',
    numeric: 'Float',
    real: 'Float',
    boolean: 'Boolean',
    bool: 'Boolean',
    varchar: 'String',
    text: 'String',
    uuid: 'ID',
    date: 'String',
    datetime: 'String',
    timestamp: 'String',
    json: 'JSON',
    'simple-json': 'JSON',
  };
  return map[type] || 'String';
}

export function generateTypeDefsFromTables(
  tables: any[],
  metadatas: EntityMetadata[],
): string {
  let typeDefs = '';
  let queryDefs = '';
  let resultDefs = '';

  for (const table of tables) {
    const typeName = table.name;

    typeDefs += `\ntype ${typeName} {\n`;

    // Lấy đúng EntityMetadata
    const entityMeta = metadatas.find((meta) => meta.tableName === table.name);
    if (!entityMeta) continue;

    // Scalar columns
    for (const column of table.columns || []) {
      const gqlType = mapColumnTypeToGraphQL(column.type);
      const fieldName = column.name;
      const isRequired = !column.isNullable ? '!' : '';

      const finalType =
        column.isPrimary && gqlType === 'ID'
          ? 'ID!'
          : `${gqlType}${isRequired}`;

      typeDefs += `  ${fieldName}: ${finalType}\n`;
    }

    // Relations → lấy từ entityMeta.relations
    for (const rel of entityMeta.relations) {
      const relName = rel.propertyName;
      const targetType = rel.inverseEntityMetadata?.tableName || 'UNKNOWN';
      const isArray = rel.isOneToMany || rel.isManyToMany;

      if (isArray) {
        typeDefs += `  ${relName}: [${targetType}!]!\n`;
      } else {
        typeDefs += `  ${relName}: ${targetType}\n`;
      }
    }

    typeDefs += `}\n`;

    // Generate XXXResult type
    resultDefs += `
type ${typeName}Result {
  data: [${typeName}!]!
  meta: MetaResult
}
`;

    // Generate Query field
    queryDefs += `  ${typeName}(
    filter: JSON,
    sort: [String!],
    page: Int,
    limit: Int
  ): ${typeName}Result!\n`;
  }

  const metaResultDef = `
type MetaResult {
  totalCount: Int
  filterCount: Int
  aggregate: JSON
}
`;

  const fullTypeDefs = `
scalar JSON
${typeDefs}
${resultDefs}
${metaResultDef}

type Query {
${queryDefs}
}
`;

  return fullTypeDefs;
}

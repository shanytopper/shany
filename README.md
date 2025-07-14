# shany

This repository now includes a simple GraphQL proof of concept built with [HotChocolate](https://chillicream.com/docs/hotchocolate) v15. The service uses an in-memory dictionary as its datasource and exposes both a query and a mutation.

## Running the GraphQL service

```bash
dotnet run --project GraphQLDemo
```

The GraphQL endpoint will be available at `http://localhost:5000/graphql` by default.

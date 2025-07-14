using System.Collections.Generic;
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(new Dictionary<int, string>());

builder.Services
    .AddGraphQLServer()
    .AddQueryType<Query>()
    .AddMutationType<Mutation>();

var app = builder.Build();

app.MapGraphQL();

app.Run();

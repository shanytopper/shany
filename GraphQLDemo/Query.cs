using System.Collections.Generic;
using HotChocolate;
using HotChocolate.Types;

public class Query
{
    public string? GetItem(int id, [Service] Dictionary<int, string> data)
    {
        return data.TryGetValue(id, out var value) ? value : null;
    }

    public IDictionary<int, string> GetItems([Service] Dictionary<int, string> data)
        => data;
}

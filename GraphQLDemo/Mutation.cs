using System.Collections.Generic;
using HotChocolate;

public class Mutation
{
    public string AddItem(int id, string value, [Service] Dictionary<int, string> data)
    {
        data[id] = value;
        return value;
    }
}

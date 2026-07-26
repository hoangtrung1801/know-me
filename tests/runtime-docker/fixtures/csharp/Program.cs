namespace Knowns.RuntimeDocker.CSharpSmoke;

public static class Program
{
    public static int Main(string[] args)
    {
        var message = BuildMessage(args);
        Console.WriteLine(message);
        return 0;
    }

    public static string BuildMessage(IEnumerable<string> args)
    {
        var suffix = args.Any() ? string.Join(",", args) : "ready";
        return $"knowns csharp lsp {suffix}";
    }
}

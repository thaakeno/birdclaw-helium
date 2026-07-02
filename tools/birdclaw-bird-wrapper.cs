using System;
using System.Diagnostics;
using System.Text;

public static class BirdclawBirdWrapper
{
    public static int Main(string[] args)
    {
        var arguments = new StringBuilder();
        AddArgument(arguments, @"C:\Users\alier\AppData\Roaming\npm\node_modules\@steipete\bird\dist\cli.js");
        var shouldAddAll = ShouldAddAll(args);
        foreach (var arg in args)
        {
            AddArgument(arguments, arg);
        }

        if (shouldAddAll)
        {
            AddArgument(arguments, "--all");
        }

        AddArgument(arguments, "--cookie-source");
        AddArgument(arguments, "chrome");
        AddArgument(arguments, "--chrome-profile-dir");
        AddArgument(arguments, @"C:\Users\alier\AppData\Local\imput\Helium\User Data\Default");

        var psi = new ProcessStartInfo
        {
            FileName = @"D:\Programs\Nodejs\node.exe",
            Arguments = arguments.ToString(),
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        using (var process = new Process { StartInfo = psi })
        {
            process.Start();

            var stdout = process.StandardOutput.ReadToEnd();
            var stderr = process.StandardError.ReadToEnd();
            process.WaitForExit();

            Console.Out.Write(stdout);
            Console.Error.Write(stderr);
            return process.ExitCode;
        }
    }

    private static void AddArgument(StringBuilder builder, string argument)
    {
        if (builder.Length > 0)
        {
            builder.Append(' ');
        }

        builder.Append('"');
        builder.Append((argument ?? string.Empty).Replace("\"", "\\\""));
        builder.Append('"');
    }

    private static bool ShouldAddAll(string[] args)
    {
        if (args == null || args.Length == 0)
        {
            return false;
        }

        var command = args[0];
        if (command != "bookmarks" && command != "likes")
        {
            return false;
        }

        var hasMaxPages = false;
        var hasAll = false;
        var hasCursor = false;
        foreach (var arg in args)
        {
            if (arg == "--max-pages")
            {
                hasMaxPages = true;
            }
            else if (arg == "--all")
            {
                hasAll = true;
            }
            else if (arg == "--cursor")
            {
                hasCursor = true;
            }
        }

        return hasMaxPages && !hasAll && !hasCursor;
    }
}

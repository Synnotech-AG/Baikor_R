namespace BaikorR.Api.Authentication;

public static class BaikorRoles
{
    public const string Viewer = "baikor_viewer";
    public const string Editor = "baikor_editor";
    public const string Approver = "baikor_approver";
    public const string Administrator = "baikor_admin";

    public static readonly string[] All = [Viewer, Editor, Approver, Administrator];
    public static readonly string[] Editors = [Editor, Approver, Administrator];
    public static readonly string[] Approvers = [Approver, Administrator];
}

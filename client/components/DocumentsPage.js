"use client";
import { useEffect, useState } from "react";
import api from "../services/api";
import PageHeader from "./PageHeader";
import DataTable from "./DataTable";
import Pagination from "./Pagination";
import Modal from "./Modal";
import StatusBadge from "./StatusBadge";
import { bytes, formatDate } from "../utils/format";
import { toast } from "sonner";
const blank = {
  title: "",
  description: "",
  categoryId: "",
  version: "1.0",
  targetType: "ALL",
  targetBatches: [],
  publishDate: "",
  isPublished: true,
  tags: "",
};
export default function DocumentsPage({ editable = false }) {
  const [rows, setRows] = useState([]),
    [cats, setCats] = useState([]),
    [batches, setBatches] = useState([]),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [modal, setModal] = useState(false),
    [form, setForm] = useState(blank),
    [file, setFile] = useState(null),
    [editId, setEditId] = useState(null);
  const load = async () => {
    const req = [
      api.get("/documents", { params: { page, limit: 10, search, category } }),
      api.get("/document-categories", { params: { limit: 100 } }),
      api.get("/batches", { params: { limit: 100 } }),
    ];
    const [r, c, b] = await Promise.all(req);
    setRows(r.data.data);
    setPages(r.data.pagination.pages);
    setCats(c.data.data);
    setBatches(b.data.data);
  };
  useEffect(() => {
    load().catch(() => toast.error("Failed to load documents"));
  }, [page, search, category]);
  const save = async (e) => {
    e.preventDefault();

    if (!form.title.trim()) {
      toast.error("Document title is required");
      return;
    }

    if (!form.categoryId) {
      toast.error("Select a document category");
      return;
    }

    if (form.targetType === "BATCH" && form.targetBatches.length === 0) {
      toast.error("Select at least one target batch");
      return;
    }

    if (!editId && !file) {
      toast.error("Please select a document file");
      return;
    }

    try {
      const formData = new FormData();

      formData.append("title", form.title.trim());

      formData.append("description", form.description || "");

      formData.append("categoryId", form.categoryId);

      formData.append("version", form.version || "1.0");

      formData.append("targetType", form.targetType || "ALL");

      formData.append("isPublished", String(form.isPublished));

      /*
       * Only append date when one
       * has actually been selected.
       */
      if (form.publishDate) {
        formData.append("publishDate", form.publishDate);
      }

      if (form.tags) {
        formData.append("tags", form.tags);
      }

      if (form.targetType === "BATCH") {
        for (const batchId of form.targetBatches) {
          formData.append("targetBatches", batchId);
        }
      }

      if (file) {
        console.log("Uploading:", {
          name: file.name,
          size: file.size,
          type: file.type,
        });

        /*
         * MUST MATCH:
         *
         * upload.single("file")
         */
        formData.append("file", file, file.name);
      }

      let response;

      if (editId) {
        /*
         * Axios multipart helper.
         */
        response = await api.patchForm(`/documents/${editId}`, formData);
      } else {
        /*
         * Axios multipart helper.
         */
        response = await api.postForm("/documents", formData);
      }

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || "Document operation failed");
      }

      toast.success(
        editId
          ? "Document updated successfully"
          : "Document uploaded successfully",
      );

      setModal(false);

      setForm({
        ...blank,
      });

      setFile(null);

      setEditId(null);

      await load();
    } catch (error) {
      console.error("DOCUMENT UPLOAD ERROR", {
        status: error?.response?.status,

        data: error?.response?.data,

        message: error?.message,
      });

      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Document upload failed",
      );
    }
  };
  const getDownloadError = async (error) => {
    try {
      const data = error?.response?.data;

      if (data instanceof Blob) {
        const text = await data.text();

        if (text) {
          const json = JSON.parse(text);

          return json?.message || "Document download failed";
        }
      }

      return data?.message || error?.message || "Document download failed";
    } catch {
      return "Document download failed";
    }
  };

  const download = async (row) => {
    try {
      const response = await api.get(`/documents/${row._id}/download`, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type:
          response.headers["content-type"] ||
          row.mimeType ||
          "application/octet-stream",
      });

      const url = window.URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      anchor.href = url;

      anchor.download = row.originalFileName || row.title || "document";

      document.body.appendChild(anchor);

      anchor.click();

      anchor.remove();

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);

      // Refresh download counter
      await load();
    } catch (error) {
      console.error("Document download error:", error);

      const message = await getDownloadError(error);

      toast.error(message);
    }
  };
  const edit = (r) => {
    setEditId(r._id);
    setForm({
      title: r.title,
      description: r.description || "",
      categoryId: r.categoryId?._id || "",
      version: r.version || "1.0",
      targetType: r.targetType,
      targetBatches: (r.targetBatches || []).map((x) => x._id || x),
      publishDate: r.publishDate?.slice(0, 10) || "",
      isPublished: r.isPublished,
      tags: (r.tags || []).join(", "),
    });
    setModal(true);
  };
  const del = async (r) => {
    if (!confirm("Delete this document?")) return;
    try {
      await api.delete(`/documents/${r._id}`);
      toast.success("Document deleted");
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || "Delete failed");
    }
  };
  const cols = [
    { key: "title", label: "Title" },
    {
      key: "category",
      label: "Category",
      render: (r) => r.categoryId?.name || "—",
    },
    { key: "version", label: "Version" },
    { key: "targetType", label: "Target" },
    { key: "fileSize", label: "Size", render: (r) => bytes(r.fileSize) },
    {
      key: "published",
      label: "Published",
      render: (r) => (
        <StatusBadge value={r.isPublished ? "PUBLISHED" : "DRAFT"} />
      ),
    },
    {
      key: "publishDate",
      label: "Date",
      render: (r) => formatDate(r.publishDate || r.createdAt),
    },
    {
      key: "downloads",
      label: "Downloads",
      render: (r) => r.downloadCount || 0,
    },
    {
      key: "actions",
      label: "Actions",
      render: (r) => (
        <div className="row-actions">
          <button className="btn btn-secondary" onClick={() => download(r)}>
            Download
          </button>
          {editable && (
            <>
              <button className="btn btn-secondary" onClick={() => edit(r)}>
                Edit
              </button>
              <button className="btn btn-danger" onClick={() => del(r)}>
                Delete
              </button>
            </>
          )}
        </div>
      ),
    },
  ];
  return (
    <div className="page">
      <PageHeader
        title="Documents"
        description={
          editable
            ? "Upload, target and publish industrial training resources."
            : "Browse and download documents available to your batch."
        }
        action={
          editable ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditId(null);
                setForm(blank);
                setFile(null);
                setModal(true);
              }}
            >
              Upload Document
            </button>
          ) : null
        }
      />
      <div className="toolbar">
        <input
          className="input"
          placeholder="Search documents..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <select
          className="select"
          value={category}
          onChange={(e) => {
            setPage(1);
            setCategory(e.target.value);
          }}
        >
          <option value="">All categories</option>
          {cats.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <DataTable columns={cols} rows={rows} />
      <Pagination page={page} pages={pages} onPage={setPage} />
      <Modal
        open={modal}
        title={editId ? "Edit Document" : "Upload Document"}
        onClose={() => setModal(false)}
      >
        <form onSubmit={save} className="form-grid">
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Category</label>
            <select
              className="select"
              required
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Select</option>
              {cats.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Version</label>
            <input
              className="input"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Target</label>
            <select
              className="select"
              value={form.targetType}
              onChange={(e) =>
                setForm({
                  ...form,
                  targetType: e.target.value,
                  targetBatches: [],
                })
              }
            >
              <option>ALL</option>
              <option>BATCH</option>
            </select>
          </div>
          {form.targetType === "BATCH" && (
            <div style={{ gridColumn: "1/-1" }}>
              <label className="label">
                Target Batches (Ctrl/Cmd select multiple)
              </label>
              <select
                className="select"
                multiple
                value={form.targetBatches}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targetBatches: Array.from(
                      e.target.selectedOptions,
                      (x) => x.value,
                    ),
                  })
                }
              >
                {batches.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.batchName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label">Publish Date</label>
            <input
              className="input"
              type="date"
              value={form.publishDate}
              onChange={(e) =>
                setForm({ ...form, publishDate: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Tags</label>
            <input
              className="input"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="forms, report, guideline"
            />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="label">Description</label>
            <textarea
              className="textarea"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="label">
              {editId ? "Replace File (optional)" : "File"}
            </label>
            <input
              className="input"
              type="file"
              required={!editId}
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) =>
                setForm({ ...form, isPublished: e.target.checked })
              }
            />{" "}
            Published
          </label>
          <div style={{ gridColumn: "1/-1" }}>
            <button className="btn btn-primary">Save Document</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

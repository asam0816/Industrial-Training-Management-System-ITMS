"use client";
import { useEffect, useState } from "react";
import api from "../services/api";
import PageHeader from "./PageHeader";
import DataTable from "./DataTable";
import Modal from "./Modal";
import StatusBadge from "./StatusBadge";
import { toast } from "sonner";
const blank = {
  batchName: "",
  batchCode: "",
  programme: "BSc (Hons) Software Engineering",
  academicYear: "2026",
  startDate: "",
  endDate: "",
  description: "",
  status: "ACTIVE",
};
export default function BatchesPage({ editable }) {
  const [rows, setRows] = useState([]),
    [modal, setModal] = useState(false),
    [form, setForm] = useState(blank),
    [id, setId] = useState(null);
  const load = () =>
    api
      .get("/batches", { params: { limit: 100 } })
      .then((r) => setRows(r.data.data));
  useEffect(() => {
    load().catch(() => toast.error("Failed to load batches"));
  }, []);
  const save = async (e) => {
    e.preventDefault();
    try {
      id
        ? await api.patch(`/batches/${id}`, form)
        : await api.post("/batches", form);
      toast.success("Batch saved");
      setModal(false);
      setForm(blank);
      setId(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || "Save failed");
    }
  };
  const edit = (r) => {
    setId(r._id);
    setForm({
      batchName: r.batchName || "",
      batchCode: r.batchCode || "",
      programme: r.programme || "",
      academicYear: r.academicYear || "",
      startDate: r.startDate?.slice(0, 10) || "",
      endDate: r.endDate?.slice(0, 10) || "",
      description: r.description || "",
      status: r.status || "ACTIVE",
    });
    setModal(true);
  };
  const archive = async (r) => {
    await api.patch(`/batches/${r._id}`, { status: "ARCHIVED" });
    toast.success("Batch archived");
    load();
  };
  const cols = [
    { key: "batchCode", label: "Code" },
    { key: "batchName", label: "Batch Name" },
    { key: "programme", label: "Programme" },
    { key: "academicYear", label: "Academic Year" },
    { key: "studentCount", label: "Students" },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusBadge value={r.status} />,
    },
    ...(editable
      ? [
          {
            key: "actions",
            label: "Actions",
            render: (r) => (
              <div className="row-actions">
                <button className="btn btn-secondary" onClick={() => edit(r)}>
                  Edit
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => archive(r)}
                >
                  Archive
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="page">
      <PageHeader
        title="Batches"
        description="Academic batches and student groups."
        action={
          editable ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                setId(null);
                setForm(blank);
                setModal(true);
              }}
            >
              Create Batch
            </button>
          ) : null
        }
      />
      <DataTable columns={cols} rows={rows} />
      <Modal
        open={modal}
        title={id ? "Edit Batch" : "Create Batch"}
        onClose={() => setModal(false)}
      >
        <form className="form-grid" onSubmit={save}>
          {[
            ["batchName", "Batch Name"],
            ["batchCode", "Batch Code"],
            ["programme", "Programme"],
            ["academicYear", "Academic Year"],
            ["startDate", "Start Date"],
            ["endDate", "End Date"],
          ].map(([k, l]) => (
            <div key={k}>
              <label className="label">{l}</label>
              <input
                className="input"
                type={k.includes("Date") ? "date" : "text"}
                required={!["endDate"].includes(k)}
                value={form[k] || ""}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
          <div style={{ gridColumn: "1/-1" }}>
            <label className="label">Description</label>
            <textarea
              className="textarea"
              value={form.description || ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="select"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option>ACTIVE</option>
              <option>COMPLETED</option>
              <option>ARCHIVED</option>
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <button className="btn btn-primary">Save Batch</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

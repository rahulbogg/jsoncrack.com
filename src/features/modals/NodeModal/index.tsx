import React, { useState, useMemo } from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Text,
  ScrollArea,
  Flex,
  CloseButton,
  Button,
  Textarea,
  Group,
} from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import { toast } from "react-hot-toast";
import useFile from "../../../store/useFile";
import useJson from "../../../store/useJson";
import type { NodeData } from "../../../types/graph";
import type { NodeRow } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

// Parse edited JSON content back to NodeRow format
const parseEditedContent = (content: string, originalRows: NodeRow[]): NodeRow[] => {
  try {
    const parsed = JSON.parse(content);

    // If it's a single value (not an object)
    if (!originalRows[0]?.key && originalRows.length === 1) {
      return [
        {
          ...originalRows[0],
          value: String(parsed),
        },
      ];
    }

    // If it's an object with multiple properties
    return Object.entries(parsed).map(([key, value]) => {
      const original = originalRows.find(row => row.key === key);
      return {
        key,
        value: String(value),
        type: original?.type || "string",
      };
    });
  } catch {
    throw new Error("Invalid JSON format");
  }
};

// Update JSON with new node value
const updateJsonWithNodeValue = (
  json: string,
  path: NodeData["path"],
  newValue: NodeRow[]
): string => {
  try {
    const parsed = JSON.parse(json);

    if (!path || path.length === 0) {
      // Root level edit
      if (newValue.length === 1 && !newValue[0].key) {
        return JSON.stringify(newValue[0].value, null, 2);
      }
      const obj: any = {};
      newValue.forEach(row => {
        if (row.key) obj[row.key] = parseValueByType(row.value, row.type);
      });
      return JSON.stringify(obj, null, 2);
    }

    // Navigate to the parent object/array
    let current = parsed;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }

    const lastKey = path[path.length - 1];

    // Update the target value
    if (newValue.length === 1 && !newValue[0].key) {
      // Single value update
      current[lastKey] = parseValueByType(newValue[0].value, newValue[0].type);
    } else {
      // Object update
      const obj: any = {};
      newValue.forEach(row => {
        if (row.key) obj[row.key] = parseValueByType(row.value, row.type);
      });
      current[lastKey] = obj;
    }

    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    console.error("Error updating JSON:", error);
    throw error;
  }
};

// Parse value based on its type
const parseValueByType = (value: string | number | null, type: string): any => {
  if (value === null || value === "null") return null;
  if (type === "boolean") return value === "true" || value === "1";
  if (type === "number") return Number(value);
  return value;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setGraph = useGraph(state => state.setGraph);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const setJson = useJson(state => state.setJson);
  const getJson = useJson(state => state.getJson);
  const setContents = useFile(state => state.setContents);
  const setSelectedNode = useGraph.getState().setSelectedNode;

  const normalizedContent = useMemo(() => normalizeNodeData(nodeData?.text ?? []), [nodeData]);

  const handleEditClick = () => {
    setEditedContent(normalizedContent);
    setIsEditing(true);
  };

  const handleSave = () => {
    try {
      const newNodeRows = parseEditedContent(editedContent, nodeData?.text ?? []);

      // Update the JSON
      const updatedJson = updateJsonWithNodeValue(getJson(), nodeData?.path, newNodeRows);
      setJson(updatedJson);
      setContents({ contents: updatedJson });

      // Refresh the graph with the updated JSON to reflect changes in the visualization
      setGraph(updatedJson);

      // After regenerating the graph, find the corresponding node by path and re-select it
      try {
        const allNodes = useGraph.getState().nodes;
        const targetPath = JSON.stringify(nodeData?.path ?? []);
        const matched = allNodes.find(n => JSON.stringify(n.path ?? []) === targetPath);
        if (matched) {
          setSelectedNode(matched as any);
        }
      } catch (err) {
        // non-fatal
        // console.warn('Failed to re-select updated node', err);
      }

      toast.success("Node value updated!");
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error?.message || "Failed to update node value");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedContent("");
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <CloseButton onClick={onClose} />
          </Flex>
          {isEditing ? (
            <>
              <Textarea
                value={editedContent}
                onChange={e => setEditedContent(e.currentTarget.value)}
                placeholder="Edit JSON content"
                minRows={8}
                maxRows={20}
                styles={{
                  input: {
                    fontFamily: "monospace",
                    fontSize: "12px",
                  },
                }}
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button onClick={handleSave} color="green">
                  Save
                </Button>
              </Group>
            </>
          ) : (
            <>
              <ScrollArea.Autosize mah={250} maw={600}>
                <CodeHighlight
                  code={normalizedContent}
                  miw={350}
                  maw={600}
                  language="json"
                  withCopyButton
                />
              </ScrollArea.Autosize>
              <Button onClick={handleEditClick} color="blue" size="sm">
                Edit
              </Button>
            </>
          )}
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};

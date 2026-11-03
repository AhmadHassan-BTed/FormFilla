import json
import os

SOURCE_PATH = r"T:\huggingface_cache\datasets--osunlp--Mind2Web\snapshots\17ece8eb89862368edc0cc806acee6fca5163474\data\train\train_0.json"
TARGET_PATH = r"p:\JobApplier\scratch\mind2web_sample.json"

def main():
    if not os.path.exists(SOURCE_PATH):
        print(f"Error: source file not found at {SOURCE_PATH}")
        return

    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    tasks_to_process = min(20, len(data))
    filtered_tasks = []

    for i in range(tasks_to_process):
        task = data[i]
        actions = task.get("actions", [])
        
        filtered_actions = []
        for act in actions:
            op_info = act.get("operation", {})
            op_type = op_info.get("op")
            
            if op_type in ("TYPE", "SELECT"):
                # Find corresponding pos_candidate
                pos_candidates = act.get("pos_candidates", [])
                if not pos_candidates:
                    continue
                
                pc = pos_candidates[0]
                filtered_actions.append({
                    "op": op_type,
                    "value": op_info.get("value"),
                    "backend_node_id": pc.get("backend_node_id"),
                    "target_tag": pc.get("tag"),
                    "target_attributes": pc.get("attributes"),
                    "html": act.get("cleaned_html")
                })
        
        if filtered_actions:
            filtered_tasks.append({
                "annotation_id": task.get("annotation_id"),
                "confirmed_task": task.get("confirmed_task"),
                "website": task.get("website"),
                "actions": filtered_actions
            })

    # Create parent folder for target if it doesn't exist
    os.makedirs(os.path.dirname(TARGET_PATH), exist_ok=True)
    
    with open(TARGET_PATH, "w", encoding="utf-8") as f:
        json.dump(filtered_tasks, f, indent=2, ensure_ascii=False)

    print(f"Successfully processed {len(filtered_tasks)} tasks with fillable inputs.")
    print(f"Saved compact dataset to {TARGET_PATH}")

if __name__ == "__main__":
    main()

import { doc, getDocs, query, updateDoc, where, collection } from "firebase/firestore";
import { db } from "../firebaseConfig";

async function resolveStudentDocId(student) {
  if (student?.docId) {
    return student.docId;
  }

  const usersRef = collection(db, "students");

  if (student?.studentID) {
    const byStudentId = query(usersRef, where("studentID", "==", student.studentID));
    const snapshot = await getDocs(byStudentId);

    if (!snapshot.empty) {
      return snapshot.docs[0].id;
    }
  }

  if (student?.email) {
    const byEmail = query(usersRef, where("email", "==", student.email));
    const snapshot = await getDocs(byEmail);

    if (!snapshot.empty) {
      return snapshot.docs[0].id;
    }
  }

  throw new Error("Student record could not be located in Firestore.");
}

export async function commitStudyPlanTodo(student, node) {
  const docId = await resolveStudentDocId(student);
  const currentTodos = Array.isArray(student?.studyPlanTodos) ? student.studyPlanTodos : [];
  const existingTodo = currentTodos.find((item) => item.sourceNodeId === node.id);

  if (existingTodo) {
    return {
      ...student,
      docId,
      studyPlanTodos: currentTodos,
    };
  }

  const nextTodo = {
    id: `todo-${Date.now()}`,
    title: node.label,
    details: node.assignment,
    sourceNodeId: node.id,
    completed: false,
    createdAt: new Date().toISOString(),
  };
  const nextTodos = [...currentTodos, nextTodo];

  await updateDoc(doc(db, "students", docId), {
    studyPlanTodos: nextTodos,
    updatedAt: new Date().toISOString(),
  });

  return {
    ...student,
    docId,
    studyPlanTodos: nextTodos,
  };
}

export async function toggleStudyPlanTodo(student, todoId) {
  const docId = await resolveStudentDocId(student);
  const currentTodos = Array.isArray(student?.studyPlanTodos) ? student.studyPlanTodos : [];
  const nextTodos = currentTodos.map((item) => (
    item.id === todoId
      ? { ...item, completed: !item.completed, completedAt: !item.completed ? new Date().toISOString() : null }
      : item
  ));

  await updateDoc(doc(db, "students", docId), {
    studyPlanTodos: nextTodos,
    updatedAt: new Date().toISOString(),
  });

  return {
    ...student,
    docId,
    studyPlanTodos: nextTodos,
  };
}

export async function removeStudyPlanTodosByNodeIds(student, nodeIds = []) {
  const targetIds = new Set(nodeIds);
  const docId = await resolveStudentDocId(student);
  const currentTodos = Array.isArray(student?.studyPlanTodos) ? student.studyPlanTodos : [];
  const nextTodos = currentTodos.filter((item) => !targetIds.has(item.sourceNodeId));

  await updateDoc(doc(db, "students", docId), {
    studyPlanTodos: nextTodos,
    updatedAt: new Date().toISOString(),
  });

  return {
    ...student,
    docId,
    studyPlanTodos: nextTodos,
  };
}

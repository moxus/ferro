#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Define String Struct matching LLVM layout { i8*, i32, i32 }
typedef struct {
  char* ptr;
  int len;
  int cap;
} fs_String;

// Allocation
fs_String fs_string_alloc(int size) {
  fs_String s;
  s.ptr = (char*)malloc(size + 1);
  s.len = 0;
  s.cap = size;
  if (s.ptr) s.ptr[0] = '\0';
  return s;
}

// From literal (allocates/copies)
fs_String fs_string_from_literal(char* data, int len) {
  fs_String s = fs_string_alloc(len);
  if (s.ptr) {
    memcpy(s.ptr, data, len);
    s.ptr[len] = '\0';
    s.len = len;
  }
  return s;
}

// Concatenation: Takes pointers to avoid struct passing ABI issues
fs_String fs_string_concat(fs_String* s1, fs_String* s2) {
  int new_len = s1->len + s2->len;
  fs_String s = fs_string_alloc(new_len);
  if (s.ptr) {
    if (s1->ptr) memcpy(s.ptr, s1->ptr, s1->len);
    if (s2->ptr) memcpy(s.ptr + s1->len, s2->ptr, s2->len);
    s.ptr[new_len] = '\0';
    s.len = new_len;
  }
  return s;
}

// Print String: Takes pointer
void fs_print_string(fs_String* s) {
  if (s->ptr) {
    printf("%.*s\n", s->len, s->ptr);
  } else {
    printf("(null)\n");
  }
}

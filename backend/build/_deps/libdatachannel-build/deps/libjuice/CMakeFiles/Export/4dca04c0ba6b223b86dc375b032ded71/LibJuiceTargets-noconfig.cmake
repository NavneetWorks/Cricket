#----------------------------------------------------------------
# Generated CMake target import file.
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "LibJuice::LibJuice" for configuration ""
set_property(TARGET LibJuice::LibJuice APPEND PROPERTY IMPORTED_CONFIGURATIONS NOCONFIG)
set_target_properties(LibJuice::LibJuice PROPERTIES
  IMPORTED_LOCATION_NOCONFIG "${_IMPORT_PREFIX}/lib64/libjuice.so.1.4.2"
  IMPORTED_SONAME_NOCONFIG "libjuice.so.1.4.2"
  )

list(APPEND _cmake_import_check_targets LibJuice::LibJuice )
list(APPEND _cmake_import_check_files_for_LibJuice::LibJuice "${_IMPORT_PREFIX}/lib64/libjuice.so.1.4.2" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)

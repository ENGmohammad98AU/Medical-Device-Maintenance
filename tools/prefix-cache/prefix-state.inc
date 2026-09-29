  glue_msg_prefix_state_res action_prefix_state(const char *req_raw)
  {
    PARSE_REQ(glue_msg_prefix_state_req);
    glue_msg_prefix_state_res res;
    const int slot = req.slot.value;
    const size_t max_bytes = 256 * 1024 * 1024;
    if (!ctx || !readers.empty() || slot < 0 || slot >= params.n_parallel || slot > 3)
      throw app_exception("Prefix state requires a loaded, idle model and a valid slot");

    const std::string path = "/tmp/mdm-prefix-" + std::to_string(slot) + ".bin";
    struct cleanup_file
    {
      std::string path;
      ~cleanup_file() { std::remove(path.c_str()); }
    } cleanup{path};

    if (req.restore.value)
    {
      if (req.data.arr.size() != 1 || req.data.arr[0].size() < 32 || req.data.arr[0].size() > max_bytes)
        throw app_exception("Invalid prefix state size");
      std::ofstream output(path, std::ios::binary | std::ios::trunc);
      output.write(reinterpret_cast<const char *>(req.data.arr[0].data()), req.data.arr[0].size());
      output.close();
      if (!output) throw app_exception("Unable to write prefix state");
    }
    else if (!req.data.arr.empty())
      throw app_exception("Unexpected prefix data");

    auto rd = ctx_server.get_response_reader();
    server_task task(req.restore.value ? SERVER_TASK_TYPE_SLOT_RESTORE : SERVER_TASK_TYPE_SLOT_SAVE);
    task.id = rd.get_new_id();
    task.slot_action.id_slot = slot;
    task.slot_action.filename = "prefix.bin";
    task.slot_action.filepath = path;
    rd.post_task({std::move(task)});
    run_loop();
    auto [result, is_error] = get_next_result(rd);
    if (!result) throw app_exception("Missing prefix state result");
    res.success.value = !is_error;
    res.data_json.value = result->to_json().dump();

    if (!is_error && !req.restore.value)
    {
      std::ifstream input(path, std::ios::binary | std::ios::ate);
      const auto size = input.tellg();
      if (!input || size < 32 || size > static_cast<std::streamoff>(max_bytes))
        throw app_exception("Invalid exported prefix state size");
      input.seekg(0);
      std::vector<uint8_t> bytes(static_cast<size_t>(size));
      input.read(reinterpret_cast<char *>(bytes.data()), bytes.size());
      if (!input) throw app_exception("Unable to read prefix state");
      res.data.arr.push_back(std::move(bytes));
    }
    return res;
  }
